use std::collections::HashSet;
use std::fs;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::OnceLock;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use dbx_plugin_sdk::PluginError;
use rand::RngCore;
use rsa::pkcs1::{DecodeRsaPrivateKey, DecodeRsaPublicKey};
use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};
use rsa::traits::PublicKeyParts;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zeroize::{Zeroize, Zeroizing};

use crate::helpers::{bad, bool_param, err, opt_str, str_param};

const MAGIC: &[u8; 4] = b"DBXK";
const VERSION: u8 = 1;
const MAX_KEYS: usize = 512;
const MAX_NAME_CHARS: usize = 128;
const MAX_KEY_MATERIAL_BYTES: usize = 1024 * 1024;
const MAX_VAULT_BYTES: usize = 16 * 1024 * 1024;
const VAULT_FILE_OVERHEAD: usize = 4 + 1 + 16 + 12 + 4 + 16;

#[derive(Clone, Serialize, Deserialize)]
pub struct StoredKey {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub algorithm: String,
    pub material: String,
    /// Public half for asymmetric keys (RSA PEM / SM2 hex). Empty for symmetric.
    #[serde(default, rename = "publicMaterial")]
    pub public_material: String,
    /// None is reserved for migrated v1 entries whose historical uses have not
    /// been confirmed. New entries always store an explicit restriction list.
    #[serde(default, rename = "allowedPurposes")]
    pub allowed_purposes: Option<Vec<String>>,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

impl Drop for StoredKey {
    fn drop(&mut self) {
        self.material.zeroize();
        self.public_material.zeroize();
    }
}

#[derive(Default, Serialize, Deserialize)]
struct VaultFile {
    #[serde(default, rename = "schemaVersion")]
    schema_version: u8,
    keys: Vec<StoredKey>,
}

struct Unlocked {
    kek: [u8; 32],
    salt: [u8; 16],
    keys: Vec<StoredKey>,
    needs_migration: bool,
}

impl Drop for Unlocked {
    fn drop(&mut self) {
        self.kek.zeroize();
        for key in &mut self.keys {
            key.material.zeroize();
            key.public_material.zeroize();
        }
    }
}

#[derive(Default)]
pub struct Vault {
    unlocked: Option<Unlocked>,
}

impl Vault {
    pub fn handle(&mut self, method: &str, params: Value) -> Result<Value, PluginError> {
        match method {
            "toolbox/keys/status" => self.status(),
            "toolbox/keys/setup" => self.setup(params),
            "toolbox/keys/unlock" => self.unlock(params),
            "toolbox/keys/lock" => {
                self.lock();
                Ok(json!({ "ok": true, "unlocked": false }))
            }
            "toolbox/keys/list" => self.list(),
            "toolbox/keys/create" => self.create(params),
            "toolbox/keys/rename" => self.rename(params),
            "toolbox/keys/update-purposes" => self.update_purposes(params),
            "toolbox/keys/reorder" => self.reorder(params),
            "toolbox/keys/delete" => self.delete(params),
            "toolbox/keys/import" => self.import_pem(params),
            "toolbox/keys/export" => self.export(params),
            "toolbox/keys/public" => self.export_public(params),
            "toolbox/keys/change-password" => self.change_password(params),
            "toolbox/keys/generate" => self.generate_key(params),
            "toolbox/keys/generate-keypair" => self.generate_keypair(params),
            _ => Err(PluginError::method_not_found(method)),
        }
    }

    pub fn material(&self, key_id: &str) -> Result<&StoredKey, PluginError> {
        let unlocked = self
            .unlocked
            .as_ref()
            .ok_or_else(|| err("Key vault is locked"))?;
        unlocked
            .keys
            .iter()
            .find(|key| key.id == key_id)
            .ok_or_else(|| bad("Unknown key id"))
    }

    pub fn material_for(&self, key_id: &str, purpose: &str) -> Result<&StoredKey, PluginError> {
        let key = self.material(key_id)?;
        if purpose.is_empty() { return Ok(key); }
        let effective = key.allowed_purposes.clone().unwrap_or_else(|| default_allowed_purposes(&key.algorithm));
        if !effective.iter().any(|item| item == purpose) { return Err(bad("Key is not allowed for this purpose")); }
        Ok(key)
    }

    fn status(&self) -> Result<Value, PluginError> {
        Ok(json!({
            "exists": vault_exists()?,
            "unlocked": self.unlocked.is_some(),
            "pathHint": "appdata/io.github.aili0617.toolbox/keystore"
        }))
    }

    fn setup(&mut self, params: Value) -> Result<Value, PluginError> {
        if vault_exists()? {
            return Err(bad("Key vault already exists"));
        }
        let password = Zeroizing::new(require_password(&params, "password")?);
        if self.unlocked.is_some() {
            return Err(bad("Key vault is already unlocked"));
        }
        let (kek, salt) = derive_kek(&password)?;
        let unlocked = Unlocked {
            kek,
            salt,
            keys: Vec::new(),
            needs_migration: false,
        };
        persist_contents(&unlocked.kek, &unlocked.salt, &unlocked.keys)?;
        self.unlocked = Some(unlocked);
        Ok(json!({ "ok": true, "unlocked": true }))
    }

    fn unlock(&mut self, params: Value) -> Result<Value, PluginError> {
        let password = Zeroizing::new(require_password(&params, "password")?);
        let path = vault_path()?;
        self.unlocked = Some(read_unlocked_vault(&path, &password)?);
        Ok(
            json!({ "ok": true, "unlocked": true, "count": self.unlocked.as_ref().map(|u| u.keys.len()).unwrap_or(0) }),
        )
    }

    fn lock(&mut self) {
        self.unlocked = None;
    }

    fn list(&self) -> Result<Value, PluginError> {
        let unlocked = self
            .unlocked
            .as_ref()
            .ok_or_else(|| err("Key vault is locked"))?;
        let keys: Vec<Value> = unlocked.keys.iter().map(metadata).collect();
        Ok(json!({ "keys": keys }))
    }

    fn create(&mut self, params: Value) -> Result<Value, PluginError> {
        let unlocked = self
            .unlocked
            .as_ref()
            .ok_or_else(|| err("Key vault is locked"))?;
        let name = str_param(&params, "name")?.trim();
        validate_name(name)?;
        ensure_key_capacity(unlocked.keys.len())?;
        let algorithm = canonical_algorithm(str_param(&params, "algorithm")?)?;
        if algorithm == "totp-base32" { return Err(bad("Unsupported algorithm")); }
        let generate = bool_param(&params, "generate", true);
        let (material, public_material) = if generate {
            pair_material(algorithm, &params)?
        } else {
            let raw = str_param(&params, "material")?;
            let material = normalize_material(algorithm, raw)?;
            let supplied_public = opt_str(&params, "publicMaterial").unwrap_or("").trim();
            let public_material = if supplied_public.is_empty() { companion_public(algorithm, &material)? } else { normalize_public_material(algorithm, supplied_public)? };
            (material, public_material)
        };
        if matches!(algorithm, "hpke-x25519" | "ml-kem-768" | "ml-kem-1024") && public_material.is_empty() {
            return Err(bad("Public key is required for this key type"));
        }
        let key = StoredKey {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            kind: kind_for(algorithm).to_string(),
            algorithm: algorithm.to_string(),
            material,
            public_material,
            allowed_purposes: Some(default_allowed_purposes(algorithm)),
            created_at: now_iso(),
        };
        let meta = metadata(&key);
        let mut keys = unlocked.keys.clone();
        keys.push(key);
        persist_contents(&unlocked.kek, &unlocked.salt, &keys)?;
        self.unlocked.as_mut().expect("vault checked above").keys = keys;
        Ok(json!({ "ok": true, "key": meta }))
    }

    fn rename(&mut self, params: Value) -> Result<Value, PluginError> {
        let id = str_param(&params, "id")?;
        let name = str_param(&params, "name")?.trim();
        validate_name(name)?;
        let unlocked = self
            .unlocked
            .as_ref()
            .ok_or_else(|| err("Key vault is locked"))?;
        let mut keys = unlocked.keys.clone();
        let key = keys
            .iter_mut()
            .find(|key| key.id == id)
            .ok_or_else(|| bad("Unknown key id"))?;
        key.name = name.to_string();
        persist_contents(&unlocked.kek, &unlocked.salt, &keys)?;
        self.unlocked.as_mut().expect("vault checked above").keys = keys;
        Ok(json!({ "ok": true }))
    }

    fn update_purposes(&mut self, params: Value) -> Result<Value, PluginError> {
        let id = str_param(&params, "id")?;
        let requested = params.get("allowedPurposes").and_then(Value::as_array).ok_or_else(|| bad("Missing allowedPurposes"))?;
        let purposes = requested.iter().map(|value| value.as_str().map(str::to_string).ok_or_else(|| bad("Purposes must be strings"))).collect::<Result<Vec<_>, _>>()?;
        let unlocked = self.unlocked.as_ref().ok_or_else(|| err("Key vault is locked"))?;
        let mut keys = unlocked.keys.clone();
        let key = keys.iter_mut().find(|key| key.id == id).ok_or_else(|| bad("Unknown key id"))?;
        validate_allowed_purposes(&key.algorithm, &purposes)?;
        key.allowed_purposes = Some(purposes);
        persist_contents(&unlocked.kek, &unlocked.salt, &keys)?;
        self.unlocked.as_mut().expect("vault checked above").keys = keys;
        Ok(json!({ "ok": true }))
    }

    fn reorder(&mut self, params: Value) -> Result<Value, PluginError> {
        let unlocked = self
            .unlocked
            .as_ref()
            .ok_or_else(|| err("Key vault is locked"))?;
        let ids = params
            .get("ids")
            .and_then(Value::as_array)
            .ok_or_else(|| bad("Missing ids"))?;
        let id_list: Vec<String> = ids
            .iter()
            .map(|value| {
                value
                    .as_str()
                    .map(str::to_string)
                    .ok_or_else(|| bad("Reorder ids must be strings"))
            })
            .collect::<Result<_, _>>()?;
        let ordered = apply_reorder(&unlocked.keys, &id_list)?;
        persist_contents(&unlocked.kek, &unlocked.salt, &ordered)?;
        self.unlocked.as_mut().expect("vault checked above").keys = ordered;
        Ok(json!({ "ok": true }))
    }

    fn delete(&mut self, params: Value) -> Result<Value, PluginError> {
        let id = str_param(&params, "id")?;
        if !bool_param(&params, "confirm", false) {
            return Err(bad("Deletion requires confirm=true"));
        }
        let unlocked = self
            .unlocked
            .as_ref()
            .ok_or_else(|| err("Key vault is locked"))?;
        let mut keys = unlocked.keys.clone();
        let before = keys.len();
        keys.retain(|key| key.id != id);
        if keys.len() == before {
            return Err(bad("Unknown key id"));
        }
        persist_contents(&unlocked.kek, &unlocked.salt, &keys)?;
        self.unlocked.as_mut().expect("vault checked above").keys = keys;
        Ok(json!({ "ok": true }))
    }

    fn import_pem(&mut self, params: Value) -> Result<Value, PluginError> {
        let name = str_param(&params, "name")?.trim();
        validate_name(name)?;
        let pem = str_param(&params, "pem")?;
        validate_material_size(pem)?;
        let algorithm = infer_pem_algorithm(pem)?;
        let unlocked = self
            .unlocked
            .as_ref()
            .ok_or_else(|| err("Key vault is locked"))?;
        ensure_key_capacity(unlocked.keys.len())?;
        let material = pem.trim().to_string();
        let public_material = companion_public(algorithm, &material)?;
        let key = StoredKey {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            kind: kind_for(algorithm).to_string(),
            algorithm: algorithm.to_string(),
            material,
            public_material,
            allowed_purposes: Some(default_allowed_purposes(algorithm)),
            created_at: now_iso(),
        };
        let meta = metadata(&key);
        let mut keys = unlocked.keys.clone();
        keys.push(key);
        persist_contents(&unlocked.kek, &unlocked.salt, &keys)?;
        self.unlocked.as_mut().expect("vault checked above").keys = keys;
        Ok(json!({ "ok": true, "key": meta }))
    }

    fn export(&self, params: Value) -> Result<Value, PluginError> {
        if !bool_param(&params, "confirm", false) {
            return Err(bad("Export requires confirm=true"));
        }
        let unlocked = self
            .unlocked
            .as_ref()
            .ok_or_else(|| err("Key vault is locked"))?;
        let password = Zeroizing::new(require_password(&params, "password")?);
        let candidate = derive_kek_with_salt(&password, &unlocked.salt)?;
        if candidate != unlocked.kek {
            return Err(err("Master password is wrong"));
        }
        let id = str_param(&params, "id")?;
        let key = unlocked
            .keys
            .iter()
            .find(|key| key.id == id)
            .ok_or_else(|| bad("Key not found"))?;
        Ok(json!({
            "id": key.id,
            "name": key.name,
            "algorithm": key.algorithm,
            "material": key.material,
            "publicMaterial": key.public_material,
        }))
    }

    fn export_public(&self, params: Value) -> Result<Value, PluginError> {
        let id = str_param(&params, "id")?;
        let key = self.material(id)?;
        if key.kind != "asymmetric" {
            return Err(bad("Only asymmetric keys have a public half"));
        }
        let public = if key.public_material.is_empty() {
            companion_public(&key.algorithm, &key.material)?
        } else {
            key.public_material.clone()
        };
        if public.is_empty() {
            return Err(bad("Public key is not available for this entry"));
        }
        Ok(json!({
            "id": key.id,
            "name": key.name,
            "algorithm": key.algorithm,
            "publicKey": public,
        }))
    }

    fn change_password(&mut self, params: Value) -> Result<Value, PluginError> {
        let unlocked = self
            .unlocked
            .as_ref()
            .ok_or_else(|| err("Key vault is locked"))?;
        let current = Zeroizing::new(require_password(&params, "currentPassword")?);
        let next = Zeroizing::new(require_password(&params, "newPassword")?);
        let mut current_kek = derive_kek_with_salt(&current, &unlocked.salt)?;
        if current_kek != unlocked.kek {
            current_kek.zeroize();
            return Err(err("Current master password is wrong"));
        }
        current_kek.zeroize();
        let (kek, salt) = derive_kek(&next)?;
        persist_contents(&kek, &salt, &unlocked.keys)?;
        // The regular atomic writer keeps the previous vault as a recovery
        // copy. After password rotation that copy is encrypted with the old
        // password, so remove it once the new primary is durable.
        if let Ok(path) = vault_path() {
            let _ = fs::remove_file(vault_backup_path(&path));
        }
        let unlocked = self.unlocked.as_mut().expect("vault checked above");
        unlocked.kek.zeroize();
        unlocked.kek = kek;
        unlocked.salt = salt;
        Ok(json!({ "ok": true }))
    }

    fn generate_key(&mut self, params: Value) -> Result<Value, PluginError> {
        let algorithm = canonical_algorithm(str_param(&params, "algorithm")?)?;
        if algorithm == "totp-base32" { return Err(bad("Unsupported algorithm")); }
        if matches!(algorithm, "rsa-pem" | "sm2") {
            return Err(bad("Use generate-keypair for RSA and SM2"));
        }
        let save = bool_param(&params, "save", false);
        let name = opt_str(&params, "name").unwrap_or("key").trim();
        if save {
            validate_name(name)?;
            let unlocked = self
                .unlocked
                .as_ref()
                .ok_or_else(|| err("Key vault is locked"))?;
            ensure_key_capacity(unlocked.keys.len())?;
        }
        let material = generate_material(algorithm, &params)?;
        let mut response = json!({
            "algorithm": algorithm,
            "saved": false
        });
        if save {
            let unlocked = self
                .unlocked
                .as_ref()
                .ok_or_else(|| err("Key vault is locked"))?;
            let key = StoredKey {
                id: Uuid::new_v4().to_string(),
                name: name.to_string(),
                kind: kind_for(algorithm).to_string(),
                algorithm: algorithm.to_string(),
                material: material.clone(),
                public_material: String::new(),
                allowed_purposes: Some(default_allowed_purposes(algorithm)),
                created_at: now_iso(),
            };
            let meta = metadata(&key);
            let mut keys = unlocked.keys.clone();
            keys.push(key);
            persist_contents(&unlocked.kek, &unlocked.salt, &keys)?;
            self.unlocked.as_mut().expect("vault checked above").keys = keys;
            response["saved"] = json!(true);
            response["key"] = meta;
        }
        response["material"] = json!(material);
        Ok(response)
    }

    fn generate_keypair(&mut self, params: Value) -> Result<Value, PluginError> {
        let algorithm = str_param(&params, "algorithm")?;
        let save = bool_param(&params, "save", false);
        let name = opt_str(&params, "name").unwrap_or("keypair").trim();
        if save {
            validate_name(name)?;
            let unlocked = self
                .unlocked
                .as_ref()
                .ok_or_else(|| err("Key vault is locked"))?;
            ensure_key_capacity(unlocked.keys.len())?;
        }
        let mut bits_out: Option<usize> = None;
        let mut format_out: Option<&str> = None;
        let (public, private, stored_alg) = match algorithm {
            "rsa" | "rsa-2048" | "rsa-pem" => {
                let bits = rsa_bits(&params)?;
                let format = rsa_pem_format(&params)?;
                bits_out = Some(bits);
                format_out = Some(format);
                let (public_pem, private_pem) = generate_rsa_pem(bits, format)?;
                (public_pem, private_pem, "rsa-pem")
            }
            "sm2" => {
                let (public, private) = generate_sm2_pair();
                (public, private, "sm2")
            }
            _ => return Err(bad("algorithm must be rsa or sm2")),
        };
        let mut response = json!({
            "algorithm": stored_alg,
            "publicKey": public,
            "saved": false
        });
        if let Some(bits) = bits_out {
            response["bits"] = json!(bits);
        }
        if let Some(format) = format_out {
            response["format"] = json!(format);
        }
        if save {
            let unlocked = self
                .unlocked
                .as_ref()
                .ok_or_else(|| err("Key vault is locked"))?;
            let key = StoredKey {
                id: Uuid::new_v4().to_string(),
                name: name.to_string(),
                kind: kind_for(stored_alg).to_string(),
                algorithm: stored_alg.to_string(),
                material: private.clone(),
                public_material: public.clone(),
                allowed_purposes: Some(default_allowed_purposes(stored_alg)),
                created_at: now_iso(),
            };
            let meta = metadata(&key);
            let mut keys = unlocked.keys.clone();
            keys.push(key);
            persist_contents(&unlocked.kek, &unlocked.salt, &keys)?;
            self.unlocked.as_mut().expect("vault checked above").keys = keys;
            response["saved"] = json!(true);
            response["key"] = meta;
        }
        response["privateKey"] = json!(private);
        Ok(response)
    }
}

#[derive(Serialize)]
struct VaultFileRef<'a> {
    #[serde(rename = "schemaVersion")]
    schema_version: u8,
    keys: &'a [StoredKey],
}

fn persist_contents(
    kek: &[u8; 32],
    salt: &[u8; 16],
    keys: &[StoredKey],
) -> Result<(), PluginError> {
    let path = vault_path()?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|error| err(error.to_string()))?;
    }
    let out = encode_vault_file(kek, salt, keys)?;
    persist_atomically(&path, &out)
}

fn encode_vault_file(
    kek: &[u8; 32],
    salt: &[u8; 16],
    keys: &[StoredKey],
) -> Result<Vec<u8>, PluginError> {
    let mut plain =
        serde_json::to_vec(&VaultFileRef { schema_version: 2, keys }).map_err(|error| err(error.to_string()))?;
    if plain.len() > MAX_VAULT_BYTES - VAULT_FILE_OVERHEAD {
        plain.zeroize();
        return Err(bad("Key vault is too large"));
    }
    let cipher = Aes256Gcm::new_from_slice(kek).map_err(|_| err("Failed to init vault cipher"))?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let encrypted = cipher.encrypt(nonce, plain.as_ref());
    plain.zeroize();
    let ciphertext = encrypted.map_err(|_| err("Failed to encrypt vault"))?;
    let ciphertext_len =
        u32::try_from(ciphertext.len()).map_err(|_| bad("Key vault is too large"))?;
    let mut out = Vec::with_capacity(4 + 1 + 16 + 12 + 4 + ciphertext.len());
    out.extend_from_slice(MAGIC);
    out.push(VERSION);
    out.extend_from_slice(salt);
    out.extend_from_slice(&nonce_bytes);
    out.extend_from_slice(&ciphertext_len.to_be_bytes());
    out.extend_from_slice(&ciphertext);
    Ok(out)
}

struct ParsedFile {
    salt: [u8; 16],
    nonce: [u8; 12],
    ciphertext: Vec<u8>,
}

fn parse_file(bytes: &[u8]) -> Result<ParsedFile, PluginError> {
    if bytes.len() > MAX_VAULT_BYTES {
        return Err(err("Vault file is too large"));
    }
    if bytes.len() < 4 + 1 + 16 + 12 + 4 {
        return Err(err("Vault file is truncated"));
    }
    if &bytes[0..4] != MAGIC {
        return Err(err("Vault file magic mismatch"));
    }
    if bytes[4] != VERSION {
        return Err(err("Unsupported vault version"));
    }
    let mut salt = [0u8; 16];
    salt.copy_from_slice(&bytes[5..21]);
    let mut nonce = [0u8; 12];
    nonce.copy_from_slice(&bytes[21..33]);
    let len = u32::from_be_bytes(bytes[33..37].try_into().unwrap()) as usize;
    let rest = &bytes[37..];
    if rest.len() != len || len < 16 {
        return Err(err("Vault ciphertext length mismatch"));
    }
    Ok(ParsedFile {
        salt,
        nonce,
        ciphertext: rest.to_vec(),
    })
}

fn read_limited(path: &Path) -> Result<Vec<u8>, PluginError> {
    let metadata = fs::metadata(path).map_err(|_| err("Key vault not found"))?;
    if metadata.len() > MAX_VAULT_BYTES as u64 {
        return Err(err("Vault file is too large"));
    }
    let bytes = fs::read(path).map_err(|_| err("Key vault not found"))?;
    if bytes.len() > MAX_VAULT_BYTES {
        return Err(err("Vault file is too large"));
    }
    Ok(bytes)
}

fn decrypt_vault_bytes(bytes: &[u8], password: &str) -> Result<Unlocked, PluginError> {
    let parsed = parse_file(bytes)?;
    let kek = Zeroizing::new(derive_kek_with_salt(password, &parsed.salt)?);
    let cipher =
        Aes256Gcm::new_from_slice(kek.as_ref()).map_err(|_| err("Failed to init vault cipher"))?;
    let nonce = Nonce::from_slice(&parsed.nonce);
    let mut plain = cipher
        .decrypt(nonce, parsed.ciphertext.as_ref())
        .map_err(|_| err("Wrong master password or vault data is corrupt"))?;
    let parsed_file = serde_json::from_slice::<VaultFile>(&plain);
    plain.zeroize();
    let file = parsed_file.map_err(|_| err("Vault data is corrupt"))?;
    validate_loaded_keys(&file.keys)?;
    let mut keys = file.keys;
    let filled = backfill_public_material(&mut keys);
    let legacy = file.schema_version < 2;
    if legacy {
        for key in &mut keys { key.allowed_purposes = None; }
    }
    let unlocked = Unlocked {
        kek: *kek,
        salt: parsed.salt,
        keys,
        needs_migration: legacy || filled,
    };
    Ok(unlocked)
}

fn read_unlocked_vault(path: &Path, password: &str) -> Result<Unlocked, PluginError> {
    let backup = vault_backup_path(path);
    match read_limited(path) {
        Ok(bytes) => match decrypt_vault_bytes(&bytes, password) {
            Ok(mut unlocked) => { migrate_unlocked(path, path, &mut unlocked)?; Ok(unlocked) },
            Err(primary_error) => {
                match read_limited(&backup).and_then(|bytes| decrypt_vault_bytes(&bytes, password))
                {
                    Ok(mut unlocked) => { migrate_unlocked(path, &backup, &mut unlocked)?; Ok(unlocked) },
                    Err(_) => Err(primary_error),
                }
            }
        },
        Err(_) => read_limited(&backup).and_then(|bytes| decrypt_vault_bytes(&bytes, password)).and_then(|mut unlocked| { migrate_unlocked(path, &backup, &mut unlocked)?; Ok(unlocked) }),
    }
}

fn migrate_unlocked(path: &Path, source: &Path, unlocked: &mut Unlocked) -> Result<(), PluginError> {
    if !unlocked.needs_migration { return Ok(()); }
    let migration_backup = path.with_extension("v1.bak");
    if source.exists() && !migration_backup.exists() {
        fs::copy(source, &migration_backup).map_err(|error| err(format!("Failed to create migration backup: {error}")))?;
    }
    let bytes = encode_vault_file(&unlocked.kek, &unlocked.salt, &unlocked.keys)?;
    persist_atomically(path, &bytes)?;
    unlocked.needs_migration = false;
    Ok(())
}

fn validate_loaded_keys(keys: &[StoredKey]) -> Result<(), PluginError> {
    if keys.len() > MAX_KEYS {
        return Err(err("Vault contains too many keys"));
    }
    let mut ids = HashSet::new();
    for key in keys {
        if key.id.is_empty() || key.id.len() > 128 || !ids.insert(key.id.as_str()) {
            return Err(err("Vault contains an invalid key id"));
        }
        let name_chars = key.name.chars().count();
        if name_chars == 0 || name_chars > MAX_NAME_CHARS {
            return Err(err("Vault contains an invalid key name"));
        }
        validate_material_size(&key.material)
            .map_err(|_| err("Vault contains oversized key material"))?;
        validate_material_size(&key.public_material)
            .map_err(|_| err("Vault contains oversized key material"))?;
        canonical_algorithm(&key.algorithm)
            .map_err(|_| err("Vault contains an unsupported key algorithm"))?;
        if let Some(purposes) = &key.allowed_purposes {
            validate_allowed_purposes(&key.algorithm, purposes).map_err(|_| err("Vault contains invalid key purposes"))?;
        }
    }
    Ok(())
}

fn vault_path() -> Result<PathBuf, PluginError> {
    Ok(crate::data_dir::data_dir()?.join("keystore"))
}

fn vault_backup_path(path: &std::path::Path) -> PathBuf {
    path.with_extension("bak")
}

fn vault_exists() -> Result<bool, PluginError> {
    let path = vault_path()?;
    let primary = path
        .try_exists()
        .map_err(|error| err(format!("Failed to access key vault: {error}")))?;
    let backup = vault_backup_path(&path)
        .try_exists()
        .map_err(|error| err(format!("Failed to access key vault backup: {error}")))?;
    Ok(primary || backup)
}

fn persist_atomically(path: &std::path::Path, bytes: &[u8]) -> Result<(), PluginError> {
    let temp = path.with_extension(format!("tmp-{}", Uuid::new_v4()));
    let backup = vault_backup_path(path);
    let write_result = (|| -> std::io::Result<()> {
        let mut file = OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&temp)?;
        file.write_all(bytes)?;
        file.sync_all()?;
        drop(file);

        if path.exists() {
            if backup.exists() {
                fs::remove_file(&backup)?;
            }
            fs::rename(path, &backup)?;
        }
        if let Err(error) = fs::rename(&temp, path) {
            if backup.exists() && !path.exists() {
                let _ = fs::rename(&backup, path);
            }
            return Err(error);
        }
        Ok(())
    })();
    if write_result.is_err() {
        let _ = fs::remove_file(&temp);
    }
    write_result.map_err(|error| err(format!("Failed to save key vault: {error}")))
}

fn require_password(params: &Value, key: &str) -> Result<String, PluginError> {
    let password = str_param(params, key)?;
    if password.chars().count() < 8 {
        return Err(bad("Master password must be at least 8 characters"));
    }
    if password.len() > 1024 {
        return Err(bad("Master password is too long"));
    }
    Ok(password.to_string())
}

fn validate_name(name: &str) -> Result<(), PluginError> {
    let count = name.chars().count();
    if count == 0 {
        return Err(bad("Name is required"));
    }
    if count > MAX_NAME_CHARS || name.chars().any(char::is_control) {
        return Err(bad(
            "Name must be at most 128 characters and contain no control characters",
        ));
    }
    Ok(())
}

fn validate_material_size(material: &str) -> Result<(), PluginError> {
    if material.len() > MAX_KEY_MATERIAL_BYTES {
        return Err(bad("Key material is too large"));
    }
    Ok(())
}

fn ensure_key_capacity(current: usize) -> Result<(), PluginError> {
    if current >= MAX_KEYS {
        return Err(bad("Key vault is full"));
    }
    Ok(())
}

fn apply_reorder(keys: &[StoredKey], ids: &[String]) -> Result<Vec<StoredKey>, PluginError> {
    if ids.len() != keys.len() {
        return Err(bad("Reorder ids must include every key exactly once"));
    }
    let mut seen = HashSet::with_capacity(ids.len());
    let mut ordered = Vec::with_capacity(ids.len());
    for id in ids {
        if id.is_empty() || !seen.insert(id.as_str()) {
            return Err(bad("Reorder ids must include every key exactly once"));
        }
        let key = keys
            .iter()
            .find(|key| key.id == *id)
            .ok_or_else(|| bad("Unknown key id"))?;
        ordered.push(key.clone());
    }
    Ok(ordered)
}

fn derive_kek(password: &str) -> Result<([u8; 32], [u8; 16]), PluginError> {
    let mut salt = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut salt);
    let kek = derive_kek_with_salt(password, &salt)?;
    Ok((kek, salt))
}

fn derive_kek_with_salt(password: &str, salt: &[u8; 16]) -> Result<[u8; 32], PluginError> {
    let params = Params::new(19_456, 2, 1, Some(32)).map_err(|error| err(error.to_string()))?;
    let argon = Argon2::new(Algorithm::Argon2id, Version::V0x13, params);
    let mut kek = [0u8; 32];
    argon
        .hash_password_into(password.as_bytes(), salt, &mut kek)
        .map_err(|error| err(error.to_string()))?;
    Ok(kek)
}

fn canonical_algorithm(algorithm: &str) -> Result<&'static str, PluginError> {
    Ok(match algorithm.trim() {
        "aes-128" => "aes-128",
        "aes-192" => "aes-192",
        "aes-256" => "aes-256",
        "chacha20" | "chacha20-256" => "chacha20-256",
        "aes-siv" | "aes-siv-512" => "aes-siv-512",
        "aes-xts-256" => "aes-xts-256",
        "aes-xts" | "aes-xts-512" => "aes-xts-512",
        "sm4-128" => "sm4-128",
        "hmac" | "hmac-sha256" => "hmac-sha256",
        "hmac-sha1" => "hmac-sha1",
        "hmac-sha384" => "hmac-sha384",
        "hmac-sha512" => "hmac-sha512",
        "hmac-sm3" => "hmac-sm3",
        "rsa" | "rsa-pem" | "rsa-2048" => "rsa-pem",
        "sm2" => "sm2",
        "hpke-x25519" => "hpke-x25519",
        "ml-kem-768" => "ml-kem-768",
        "ml-kem-1024" => "ml-kem-1024",
        // Retained only so existing encrypted vaults remain readable.
        "totp" | "totp-base32" => "totp-base32",
        _ => return Err(bad("Unsupported algorithm")),
    })
}

fn rsa_bits(params: &Value) -> Result<usize, PluginError> {
    let bits = params
        .get("bits")
        .and_then(|value| {
            value
                .as_u64()
                .or_else(|| value.as_str().and_then(|s| s.parse().ok()))
        })
        .unwrap_or(2048) as usize;
    match bits {
        2048 | 3072 | 4096 | 8192 => Ok(bits),
        _ => Err(bad("RSA bits must be 2048, 3072, 4096, or 8192")),
    }
}

fn rsa_pem_format(params: &Value) -> Result<&'static str, PluginError> {
    match opt_str(params, "format")
        .unwrap_or("pkcs8")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
        "pkcs8" | "pkcs#8" | "spki" => Ok("pkcs8"),
        "pkcs1" | "pkcs#1" | "openssl" => Ok("pkcs1"),
        _ => Err(bad("RSA format must be pkcs8 or pkcs1")),
    }
}

fn generate_rsa_pem(bits: usize, format: &str) -> Result<(String, String), PluginError> {
    let mut rng = rand::thread_rng();
    let private_key =
        rsa::RsaPrivateKey::new(&mut rng, bits).map_err(|error| err(error.to_string()))?;
    let public_key = rsa::RsaPublicKey::from(&private_key);
    if format == "pkcs1" {
        use rsa::pkcs1::{EncodeRsaPrivateKey, EncodeRsaPublicKey, LineEnding};
        let private_pem = private_key
            .to_pkcs1_pem(LineEnding::LF)
            .map_err(|error| err(error.to_string()))?
            .to_string();
        let public_pem = public_key
            .to_pkcs1_pem(LineEnding::LF)
            .map_err(|error| err(error.to_string()))?;
        Ok((public_pem, private_pem))
    } else {
        use rsa::pkcs8::{EncodePrivateKey, EncodePublicKey, LineEnding};
        let private_pem = private_key
            .to_pkcs8_pem(LineEnding::LF)
            .map_err(|error| err(error.to_string()))?
            .to_string();
        let public_pem = public_key
            .to_public_key_pem(LineEnding::LF)
            .map_err(|error| err(error.to_string()))?;
        Ok((public_pem, private_pem))
    }
}

fn generate_sm2_pair() -> (String, String) {
    let (sk, pk) = smcrypto::sm2::gen_keypair();
    (pk, sk)
}

fn generate_material(algorithm: &str, params: &Value) -> Result<String, PluginError> {
    let mut rng = rand::thread_rng();
    match algorithm {
        "aes-128" | "sm4-128" => {
            let mut bytes = Zeroizing::new(vec![0u8; 16]);
            rng.fill_bytes(bytes.as_mut());
            Ok(hex::encode(bytes.as_slice()))
        }
        "aes-192" => {
            let mut bytes = Zeroizing::new(vec![0u8; 24]);
            rng.fill_bytes(bytes.as_mut());
            Ok(hex::encode(bytes.as_slice()))
        }
        "hmac-sha1" => {
            let mut bytes = Zeroizing::new(vec![0u8; 20]);
            rng.fill_bytes(bytes.as_mut());
            Ok(hex::encode(bytes.as_slice()))
        }
        "aes-256" | "chacha20-256" | "aes-xts-256" | "hmac" | "hmac-sha256" | "hmac-sm3" => {
            let mut bytes = Zeroizing::new(vec![0u8; 32]);
            rng.fill_bytes(bytes.as_mut());
            Ok(hex::encode(bytes.as_slice()))
        }
        "hmac-sha384" => {
            let mut bytes = Zeroizing::new(vec![0u8; 48]);
            rng.fill_bytes(bytes.as_mut());
            Ok(hex::encode(bytes.as_slice()))
        }
        "hmac-sha512" | "aes-siv-512" | "aes-xts-512" => {
            let mut bytes = Zeroizing::new(vec![0u8; 64]);
            rng.fill_bytes(bytes.as_mut());
            Ok(hex::encode(bytes.as_slice()))
        }
        "rsa" | "rsa-pem" | "rsa-2048" => {
            Ok(generate_rsa_pem(rsa_bits(params)?, rsa_pem_format(params)?)?.1)
        }
        "sm2" => Ok(generate_sm2_pair().1),
        "totp-base32" => {
            let mut bytes = Zeroizing::new(vec![0u8; 20]);
            rng.fill_bytes(bytes.as_mut());
            Ok(base32_encode(bytes.as_slice()))
        }
        _ => Err(bad(
            "Cannot generate this algorithm; import material instead",
        )),
    }
}

fn normalize_material(algorithm: &str, raw: &str) -> Result<String, PluginError> {
    let trimmed = raw.trim();
    validate_material_size(trimmed)?;
    if matches!(algorithm, "rsa-pem" | "sm2") {
        if trimmed.is_empty() {
            return Err(bad("Material is required"));
        }
        if algorithm == "rsa-pem" {
            infer_pem_algorithm(trimmed)?;
        }
        return Ok(trimmed.to_string());
    }
    if algorithm == "totp-base32" {
        let normalized = trimmed.replace([' ', '-'], "").to_ascii_uppercase();
        if normalized.len() < 16 || !normalized.bytes().all(|byte| matches!(byte, b'A'..=b'Z' | b'2'..=b'7')) { return Err(bad("TOTP secret must be Base32")); }
        return Ok(normalized);
    }
    if matches!(algorithm, "hpke-x25519" | "ml-kem-768" | "ml-kem-1024") {
        let bytes = B64.decode(trimmed.as_bytes()).map_err(|_| bad("Key material must be Base64"))?;
        if bytes.is_empty() { return Err(bad("Material is required")); }
        return Ok(B64.encode(bytes));
    }
    let bytes = Zeroizing::new(decode_key_bytes(trimmed)?);
    let expected = match algorithm {
        "aes-128" | "sm4-128" => 16,
        "aes-192" => 24,
        "aes-256" | "chacha20-256" | "aes-xts-256" => 32,
        "aes-siv-512" | "aes-xts-512" => 64,
        "hmac" | "hmac-sha1" | "hmac-sha256" | "hmac-sha384" | "hmac-sha512" | "hmac-sm3" => 0,
        _ => return Err(bad("Unsupported algorithm")),
    };
    if expected != 0 && bytes.len() != expected {
        return Err(bad(format!("Key length must be {expected} bytes")));
    }
    if bytes.is_empty() {
        return Err(bad("Material is required"));
    }
    Ok(hex::encode(bytes.as_slice()))
}

pub fn decode_key_bytes(raw: &str) -> Result<Vec<u8>, PluginError> {
    let trimmed = raw.trim();
    validate_material_size(trimmed)?;
    if let Ok(bytes) = hex::decode(trimmed) {
        if !bytes.is_empty() {
            return Ok(bytes);
        }
    }
    B64.decode(trimmed.as_bytes())
        .map_err(|_| bad("Key material must be hex or base64"))
}

fn infer_pem_algorithm(pem: &str) -> Result<&'static str, PluginError> {
    let parsed = pem::parse(pem.as_bytes()).map_err(|_| bad("Invalid PEM"))?;
    let tag = parsed.tag();
    if tag.contains("CERTIFICATE") {
        return Err(bad(
            "Do not store certificates in the key vault; use the cert tool",
        ));
    }
    let rsa_key = rsa::RsaPrivateKey::from_pkcs8_pem(pem)
        .or_else(|_| rsa::RsaPrivateKey::from_pkcs1_pem(pem))
        .map(|_| ())
        .or_else(|_| rsa::RsaPublicKey::from_public_key_pem(pem).map(|_| ()))
        .or_else(|_| rsa::RsaPublicKey::from_pkcs1_pem(pem).map(|_| ()))
        .is_ok();
    if rsa_key {
        return Ok("rsa-pem");
    }
    Err(bad(
        "PEM must be an RSA private or public key for the asymmetric cipher tool",
    ))
}

fn kind_for(algorithm: &str) -> &'static str {
    match algorithm {
        "rsa-pem" | "sm2" | "hpke-x25519" | "ml-kem-768" | "ml-kem-1024" => "asymmetric",
        _ => "symmetric",
    }
}

fn metadata(key: &StoredKey) -> Value {
    let capabilities = capabilities_for(&key.algorithm);
    let effective = key.allowed_purposes.clone().unwrap_or_else(|| default_allowed_purposes(&key.algorithm));
    let (display_type, bits, format) = key_display(&key.algorithm, &key.material);
    let mut meta = json!({
        "id": key.id,
        "name": key.name,
        "kind": key.kind,
        "algorithm": key.algorithm,
        "displayType": display_type,
        "bits": bits,
        "format": format,
        "capabilities": capabilities,
        "allowedPurposes": key.allowed_purposes,
        "effectivePurposes": effective,
        "supportLevel": support_level_for(&key.algorithm),
        "legacyPurposeState": if key.allowed_purposes.is_none() { "pending" } else { "confirmed" },
        "fingerprint": fingerprint(&key.material),
        "hasPublic": !key.public_material.is_empty(),
        "createdAt": key.created_at
    });
    if !key.public_material.is_empty() {
        meta["publicFingerprint"] = json!(fingerprint(&key.public_material));
    }
    meta
}

/// Returns (private_or_secret, public). Public is empty for symmetric algorithms.
fn pair_material(algorithm: &str, params: &Value) -> Result<(String, String), PluginError> {
    match algorithm {
        "rsa-pem" => {
            let (public, private) = generate_rsa_pem(rsa_bits(params)?, rsa_pem_format(params)?)?;
            Ok((private, public))
        }
        "sm2" => {
            let (public, private) = generate_sm2_pair();
            Ok((private, public))
        }
        _ => Ok((generate_material(algorithm, params)?, String::new())),
    }
}

/// Derive or normalize the public half for an asymmetric material blob.
fn companion_public(algorithm: &str, material: &str) -> Result<String, PluginError> {
    match algorithm {
        "rsa-pem" => derive_rsa_public_pem(material),
        "sm2" => derive_sm2_public(material),
        _ => Ok(String::new()),
    }
}

fn normalize_public_material(algorithm: &str, material: &str) -> Result<String, PluginError> {
    validate_material_size(material)?;
    match algorithm {
        "rsa-pem" | "sm2" => companion_public(algorithm, material),
        "hpke-x25519" | "ml-kem-768" | "ml-kem-1024" => {
            let bytes = B64.decode(material.as_bytes()).map_err(|_| bad("Public key must be Base64"))?;
            if bytes.is_empty() { return Err(bad("Public key is required")); }
            Ok(B64.encode(bytes))
        }
        _ => Err(bad("This key type does not have public material")),
    }
}

fn capabilities_for(algorithm: &str) -> Vec<String> {
    capability_manifest()["keyTypes"][algorithm]["capabilities"].as_array().map(|values| values.iter().filter_map(Value::as_str).map(str::to_string).collect()).unwrap_or_default()
}

fn default_allowed_purposes(algorithm: &str) -> Vec<String> {
    capabilities_for(algorithm).into_iter().filter(|purpose| purpose != "debug-xor").collect()
}

fn validate_allowed_purposes(algorithm: &str, purposes: &[String]) -> Result<(), PluginError> {
    let capabilities = capabilities_for(algorithm);
    let mut seen = HashSet::new();
    if purposes.iter().any(|purpose| !capabilities.contains(purpose) || !seen.insert(purpose)) {
        return Err(bad("Purpose is not supported by this key"));
    }
    Ok(())
}

fn support_level_for(algorithm: &str) -> &'static str {
    if capability_manifest()["keyTypes"][algorithm]["supportLevel"].as_str() == Some("compatibility") { "compatibility" } else { "supported" }
}

fn capability_manifest() -> &'static Value {
    static MANIFEST: OnceLock<Value> = OnceLock::new();
    MANIFEST.get_or_init(|| serde_json::from_str(include_str!("../../src/lib/crypto-capabilities.json")).expect("valid crypto capability manifest"))
}

fn key_display(algorithm: &str, material: &str) -> (String, Option<usize>, String) {
    let bits = match algorithm {
        "aes-128" | "sm4-128" => Some(128), "aes-192" => Some(192),
        "aes-256" | "chacha20-256" | "aes-xts-256" | "hmac-sha256" | "hmac-sm3" | "hpke-x25519" => Some(256),
        "aes-siv-512" | "aes-xts-512" | "hmac-sha512" => Some(512), "hmac-sha1" => Some(160), "hmac-sha384" => Some(384),
        "rsa-pem" => rsa_material_bits(material),
        _ => None,
    };
    let format = if algorithm == "rsa-pem" { if material.contains("BEGIN RSA") { "PKCS#1 PEM" } else { "PKCS#8 PEM" } } else if matches!(algorithm, "hpke-x25519" | "ml-kem-768" | "ml-kem-1024") { "Base64" } else if algorithm == "totp-base32" { "Base32" } else if algorithm == "sm2" { "Hex key pair" } else { "Hex" };
    (algorithm.to_ascii_uppercase(), bits, format.to_string())
}

fn rsa_material_bits(material: &str) -> Option<usize> {
    let trimmed = material.trim();
    rsa::RsaPrivateKey::from_pkcs8_pem(trimmed)
        .map(|key| key.n().bits())
        .or_else(|_| rsa::RsaPrivateKey::from_pkcs1_pem(trimmed).map(|key| key.n().bits()))
        .or_else(|_| rsa::RsaPublicKey::from_public_key_pem(trimmed).map(|key| key.n().bits()))
        .or_else(|_| rsa::RsaPublicKey::from_pkcs1_pem(trimmed).map(|key| key.n().bits()))
        .ok()
}

fn base32_encode(bytes: &[u8]) -> String {
    const ALPHABET: &[u8; 32] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let mut output = String::new();
    let mut buffer = 0u32;
    let mut bits = 0u8;
    for byte in bytes { buffer = (buffer << 8) | u32::from(*byte); bits += 8; while bits >= 5 { bits -= 5; output.push(ALPHABET[((buffer >> bits) & 31) as usize] as char); } }
    if bits > 0 { output.push(ALPHABET[((buffer << (5 - bits)) & 31) as usize] as char); }
    output
}

fn backfill_public_material(keys: &mut [StoredKey]) -> bool {
    let mut changed = false;
    for key in keys {
        if !matches!(key.algorithm.as_str(), "rsa-pem" | "sm2") || !key.public_material.is_empty() {
            continue;
        }
        if let Ok(public) = companion_public(&key.algorithm, &key.material) {
            if !public.is_empty() {
                key.public_material = public;
                changed = true;
            }
        }
    }
    changed
}

fn derive_rsa_public_pem(pem: &str) -> Result<String, PluginError> {
    let trimmed = pem.trim();
    if let Ok(private) = rsa::RsaPrivateKey::from_pkcs8_pem(trimmed) {
        use rsa::pkcs8::{EncodePublicKey, LineEnding};
        let public = rsa::RsaPublicKey::from(&private);
        return public
            .to_public_key_pem(LineEnding::LF)
            .map_err(|error| err(error.to_string()));
    }
    if let Ok(private) = rsa::RsaPrivateKey::from_pkcs1_pem(trimmed) {
        use rsa::pkcs1::{EncodeRsaPublicKey, LineEnding};
        let public = rsa::RsaPublicKey::from(&private);
        return public
            .to_pkcs1_pem(LineEnding::LF)
            .map_err(|error| err(error.to_string()));
    }
    if rsa::RsaPublicKey::from_public_key_pem(trimmed).is_ok()
        || rsa::RsaPublicKey::from_pkcs1_pem(trimmed).is_ok()
    {
        return Ok(trimmed.to_string());
    }
    Err(bad("Invalid RSA private or public key PEM"))
}

fn derive_sm2_public(material: &str) -> Result<String, PluginError> {
    let value = material.trim();
    if smcrypto::sm2::pubkey_valid(value) {
        return Ok(value.to_string());
    }
    if smcrypto::sm2::privkey_valid(value) && !value.bytes().all(|byte| byte == b'0') {
        let public = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
            smcrypto::sm2::pk_from_sk(value)
        }))
        .map_err(|_| bad("Invalid SM2 private key"))?;
        if smcrypto::sm2::pubkey_valid(&public) {
            return Ok(public);
        }
    }
    Err(bad("Invalid SM2 private or public key"))
}

fn fingerprint(material: &str) -> String {
    let digest = Sha256::digest(material.as_bytes());
    digest
        .iter()
        .take(8)
        .map(|byte| format!("{byte:02x}"))
        .collect::<Vec<_>>()
        .join(":")
}

fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    format!("{secs}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rsa_bits_accepts_common_sizes() {
        assert_eq!(rsa_bits(&json!({})).unwrap(), 2048);
        assert!(rsa_bits(&json!({ "bits": 1024 })).is_err());
        assert_eq!(rsa_bits(&json!({ "bits": "4096" })).unwrap(), 4096);
        assert_eq!(rsa_bits(&json!({ "bits": 8192 })).unwrap(), 8192);
        assert!(rsa_bits(&json!({ "bits": 512 })).is_err());
    }

    #[test]
    fn rsa_pem_format_accepts_aliases() {
        assert_eq!(rsa_pem_format(&json!({})).unwrap(), "pkcs8");
        assert_eq!(
            rsa_pem_format(&json!({ "format": "PKCS#1" })).unwrap(),
            "pkcs1"
        );
        assert_eq!(
            rsa_pem_format(&json!({ "format": "openssl" })).unwrap(),
            "pkcs1"
        );
        assert!(rsa_pem_format(&json!({ "format": "der" })).is_err());
    }

    #[test]
    fn generate_rsa_pem_uses_requested_headers() {
        let (public, private) = generate_rsa_pem(2048, "pkcs8").unwrap();
        assert!(private.contains("BEGIN PRIVATE KEY"));
        assert!(!private.contains("BEGIN RSA PRIVATE KEY"));
        assert!(public.contains("BEGIN PUBLIC KEY"));
        assert_eq!(key_display("rsa-pem", &private).1, Some(2048));
        assert_eq!(key_display("rsa-pem", &public).1, Some(2048));

        let (public, private) = generate_rsa_pem(2048, "pkcs1").unwrap();
        assert!(private.contains("BEGIN RSA PRIVATE KEY"));
        assert!(public.contains("BEGIN RSA PUBLIC KEY"));
    }

    #[test]
    fn apply_reorder_permutes_and_rejects_bad_id_lists() {
        let sample = |id: &str| StoredKey {
            id: id.into(),
            name: id.into(),
            kind: "symmetric".into(),
            algorithm: "aes-256".into(),
            material: "aa".into(),
            public_material: String::new(),
            allowed_purposes: Some(default_allowed_purposes("aes-256")),
            created_at: now_iso(),
        };
        let keys = vec![sample("a"), sample("b"), sample("c")];
        let ordered = apply_reorder(&keys, &["c".into(), "a".into(), "b".into()]).unwrap();
        assert_eq!(
            ordered
                .iter()
                .map(|key| key.id.as_str())
                .collect::<Vec<_>>(),
            vec!["c", "a", "b"]
        );
        assert!(apply_reorder(&keys, &["a".into(), "b".into()]).is_err());
        assert!(apply_reorder(&keys, &["a".into(), "b".into(), "a".into()]).is_err());
        assert!(apply_reorder(&keys, &["a".into(), "b".into(), "x".into()]).is_err());
    }

    #[test]
    fn companion_public_derives_rsa_and_sm2_from_private() {
        let (public, private) = generate_rsa_pem(2048, "pkcs8").unwrap();
        let derived = companion_public("rsa-pem", &private).unwrap();
        assert_eq!(derived.trim(), public.trim());
        assert_eq!(companion_public("rsa-pem", &public).unwrap(), public.trim());

        let (public, private) = generate_sm2_pair();
        assert_eq!(companion_public("sm2", &private).unwrap(), public);
        assert_eq!(companion_public("sm2", &public).unwrap(), public);
        assert!(companion_public("aes-256", "aabb").unwrap().is_empty());
    }

    #[test]
    fn backfill_fills_missing_asymmetric_public_material() {
        let (public, private) = generate_rsa_pem(2048, "pkcs8").unwrap();
        let mut keys = vec![StoredKey {
            id: "1".into(),
            name: "rsa".into(),
            kind: "asymmetric".into(),
            algorithm: "rsa-pem".into(),
            material: private,
            public_material: String::new(),
            allowed_purposes: None,
            created_at: now_iso(),
        }];
        assert!(backfill_public_material(&mut keys));
        assert_eq!(keys[0].public_material, public);
        assert!(!backfill_public_material(&mut keys));
    }

    #[test]
    fn generate_material_symmetric_hex_lengths() {
        let empty = json!({});
        assert_eq!(generate_material("aes-128", &empty).unwrap().len(), 32);
        assert_eq!(generate_material("sm4-128", &empty).unwrap().len(), 32);
        assert_eq!(generate_material("aes-256", &empty).unwrap().len(), 64);
        assert_eq!(generate_material("hmac-sha256", &empty).unwrap().len(), 64);
        assert_eq!(generate_material("hmac-sha1", &empty).unwrap().len(), 40);
        assert_eq!(generate_material("hmac-sha384", &empty).unwrap().len(), 96);
        assert_eq!(generate_material("hmac-sha512", &empty).unwrap().len(), 128);
        assert_eq!(generate_material("hmac-sm3", &empty).unwrap().len(), 64);
        assert!(canonical_algorithm("rsa").ok().is_some());
        assert_eq!(generate_material("chacha20-256", &empty).unwrap().len(), 64);
        assert_eq!(generate_material("aes-siv-512", &empty).unwrap().len(), 128);
        assert_eq!(generate_material("aes-xts-512", &empty).unwrap().len(), 128);
        assert!(generate_material("totp-base32", &empty).unwrap().bytes().all(|byte| matches!(byte, b'A'..=b'Z' | b'2'..=b'7')));
    }

    #[test]
    fn totp_entries_are_readable_for_recovery_but_cannot_be_created() {
        assert_eq!(canonical_algorithm("totp-base32").unwrap(), "totp-base32");
        let mut vault = Vault { unlocked: Some(Unlocked {
            kek: [0; 32], salt: [0; 16], keys: vec![], needs_migration: false,
        }) };
        assert!(vault.create(json!({"name": "test", "algorithm": "totp-base32", "generate": true})).is_err());
        assert!(vault.generate_key(json!({"algorithm": "totp-base32", "save": true, "name": "test"})).is_err());
        assert!(vault.unlocked.as_ref().unwrap().keys.is_empty());
    }

    #[test]
    fn legacy_key_xor_requires_explicit_opt_in() {
        let key = StoredKey {
            id: "legacy".into(), name: "legacy".into(), kind: "symmetric".into(),
            algorithm: "sm4-128".into(), material: "00".repeat(16),
            public_material: String::new(), allowed_purposes: None, created_at: now_iso(),
        };
        assert_eq!(metadata(&key)["effectivePurposes"], json!(["sm4-cipher"]));
        let mut vault = Vault { unlocked: Some(Unlocked {
            kek: [0; 32], salt: [0; 16], keys: vec![key], needs_migration: false,
        }) };
        assert!(vault.material_for("legacy", "sm4-cipher").is_ok());
        assert!(vault.material_for("legacy", "debug-xor").is_err());
        vault.unlocked.as_mut().unwrap().keys[0].allowed_purposes = Some(vec!["debug-xor".into()]);
        assert!(vault.material_for("legacy", "debug-xor").is_ok());
        assert_eq!(metadata(&vault.unlocked.as_ref().unwrap().keys[0])["effectivePurposes"], json!(["debug-xor"]));
    }

    #[test]
    fn shared_manifest_drives_key_capabilities() {
        assert!(capabilities_for("aes-256").contains(&"aes-aead".to_string()));
        assert!(capabilities_for("aes-256").contains(&"debug-xor".to_string()));
        assert!(!default_allowed_purposes("aes-256").contains(&"debug-xor".to_string()));
        for algorithm in ["aes-128", "aes-192", "aes-256", "sm4-128", "hmac-sha256", "chacha20-256"] {
            let key = StoredKey {
                id: "new".into(), name: "new".into(), kind: "symmetric".into(),
                algorithm: algorithm.into(), material: String::new(), public_material: String::new(),
                allowed_purposes: Some(default_allowed_purposes(algorithm)), created_at: now_iso(),
            };
            assert!(!metadata(&key)["allowedPurposes"].as_array().unwrap().contains(&json!("debug-xor")));
            assert!(!metadata(&key)["effectivePurposes"].as_array().unwrap().contains(&json!("debug-xor")));
        }
    }

    #[test]
    fn validates_names_material_limits_and_real_rsa_pem() {
        assert!(validate_name("").is_err());
        assert!(validate_name("bad\nname").is_err());
        assert!(decode_key_bytes(&"A".repeat(MAX_KEY_MATERIAL_BYTES + 1)).is_err());
        assert!(
            infer_pem_algorithm("-----BEGIN PUBLIC KEY-----\nAA==\n-----END PUBLIC KEY-----")
                .is_err()
        );
    }

    #[test]
    fn rejects_truncated_and_mismatched_vault_envelopes() {
        assert!(parse_file(b"DBXK").is_err());
        let mut bytes = Vec::new();
        bytes.extend_from_slice(MAGIC);
        bytes.push(VERSION);
        bytes.extend_from_slice(&[0u8; 16 + 12]);
        bytes.extend_from_slice(&16u32.to_be_bytes());
        bytes.extend_from_slice(&[0u8; 15]);
        assert!(parse_file(&bytes).is_err());
    }

    #[test]
    fn falls_back_to_backup_when_primary_authentication_fails() {
        let directory = std::env::temp_dir().join(format!("toolbox-vault-test-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("keystore");
        let backup = vault_backup_path(&path);
        let password = "correct horse battery staple";
        let salt = [7u8; 16];
        let kek = derive_kek_with_salt(password, &salt).unwrap();
        let valid = encode_vault_file(&kek, &salt, &[]).unwrap();
        let mut corrupt = valid.clone();
        *corrupt.last_mut().unwrap() ^= 1;
        fs::write(&path, corrupt).unwrap();
        fs::write(&backup, valid).unwrap();

        let unlocked = read_unlocked_vault(&path, password).unwrap();
        assert!(unlocked.keys.is_empty());

        fs::remove_dir_all(directory).unwrap();
    }

    #[test]
    fn v1_payload_migrates_atomically_to_schema_v2_and_keeps_legacy_purposes_pending() {
        let directory = std::env::temp_dir().join(format!("toolbox-vault-v1-{}", Uuid::new_v4()));
        fs::create_dir_all(&directory).unwrap();
        let path = directory.join("keystore");
        let password = "correct horse battery staple";
        let salt = [9u8; 16];
        let kek = derive_kek_with_salt(password, &salt).unwrap();
        let plain = serde_json::to_vec(&json!({ "keys": [{
            "id": "legacy-id", "name": "legacy", "kind": "symmetric", "algorithm": "aes-256",
            "material": "11".repeat(32), "publicMaterial": "", "createdAt": "123"
        }] })).unwrap();
        let nonce_bytes = [3u8; 12];
        let cipher = Aes256Gcm::new_from_slice(&kek).unwrap();
        let ciphertext = cipher.encrypt(Nonce::from_slice(&nonce_bytes), plain.as_ref()).unwrap();
        let mut bytes = Vec::new();
        bytes.extend_from_slice(MAGIC); bytes.push(VERSION); bytes.extend_from_slice(&salt); bytes.extend_from_slice(&nonce_bytes);
        bytes.extend_from_slice(&(ciphertext.len() as u32).to_be_bytes()); bytes.extend_from_slice(&ciphertext);
        fs::write(&path, bytes).unwrap();

        let unlocked = read_unlocked_vault(&path, password).unwrap();
        assert_eq!(unlocked.keys[0].id, "legacy-id");
        assert!(unlocked.keys[0].allowed_purposes.is_none());
        assert!(path.with_extension("v1.bak").exists());
        let migrated = decrypt_vault_bytes(&fs::read(&path).unwrap(), password).unwrap();
        assert!(!migrated.needs_migration);
        assert!(migrated.keys[0].allowed_purposes.is_none());
        fs::remove_dir_all(directory).unwrap();
    }
}
