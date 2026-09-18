use std::fs;
use std::path::PathBuf;

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use dbx_plugin_sdk::PluginError;
use rand::RngCore;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use uuid::Uuid;
use zeroize::Zeroize;

use crate::helpers::{bad, bool_param, err, opt_str, str_param};

const MAGIC: &[u8; 4] = b"DBXK";
const VERSION: u8 = 1;
const PLUGIN_ID: &str = "io.github.aili0617.toolbox";

#[derive(Clone, Serialize, Deserialize)]
pub struct StoredKey {
    pub id: String,
    pub name: String,
    pub kind: String,
    pub algorithm: String,
    pub material: String,
    #[serde(rename = "createdAt")]
    pub created_at: String,
}

#[derive(Default, Serialize, Deserialize)]
struct VaultFile {
    keys: Vec<StoredKey>,
}

struct Unlocked {
    kek: [u8; 32],
    salt: [u8; 16],
    keys: Vec<StoredKey>,
}

impl Drop for Unlocked {
    fn drop(&mut self) {
        self.kek.zeroize();
        for key in &mut self.keys {
            key.material.zeroize();
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
            "toolbox/keys/delete" => self.delete(params),
            "toolbox/keys/import" => self.import_pem(params),
            "toolbox/keys/export" => self.export(params),
            "toolbox/keys/change-password" => self.change_password(params),
            "toolbox/keys/generate" => self.generate_key(params),
            "toolbox/keys/generate-keypair" => self.generate_keypair(params),
            _ => Err(PluginError::method_not_found(method)),
        }
    }

    pub fn material(&self, key_id: &str) -> Result<&StoredKey, PluginError> {
        let unlocked = self.unlocked.as_ref().ok_or_else(|| err("Key vault is locked"))?;
        unlocked
            .keys
            .iter()
            .find(|key| key.id == key_id)
            .ok_or_else(|| bad("Unknown key id"))
    }

    fn status(&self) -> Result<Value, PluginError> {
        Ok(json!({
            "exists": vault_path()?.exists(),
            "unlocked": self.unlocked.is_some(),
            "pathHint": "appdata/io.github.aili0617.toolbox/keystore"
        }))
    }

    fn setup(&mut self, params: Value) -> Result<Value, PluginError> {
        if vault_path()?.exists() {
            return Err(bad("Key vault already exists"));
        }
        let password = require_password(&params, "password")?;
        if self.unlocked.is_some() {
            return Err(bad("Key vault is already unlocked"));
        }
        let (kek, salt) = derive_kek(&password)?;
        self.unlocked = Some(Unlocked { kek, salt, keys: Vec::new() });
        self.persist()?;
        Ok(json!({ "ok": true, "unlocked": true }))
    }

    fn unlock(&mut self, params: Value) -> Result<Value, PluginError> {
        let password = require_password(&params, "password")?;
        let bytes = fs::read(vault_path()?).map_err(|_| err("Key vault not found"))?;
        let parsed = parse_file(&bytes)?;
        let kek = derive_kek_with_salt(&password, &parsed.salt)?;
        let cipher = Aes256Gcm::new_from_slice(&kek).map_err(|_| err("Failed to init vault cipher"))?;
        let nonce = Nonce::from_slice(&parsed.nonce);
        let plain = cipher
            .decrypt(nonce, parsed.ciphertext.as_ref())
            .map_err(|_| err("Wrong master password"))?;
        let file: VaultFile = serde_json::from_slice(&plain).map_err(|_| err("Vault data is corrupt"))?;
        self.unlocked = Some(Unlocked { kek, salt: parsed.salt, keys: file.keys });
        Ok(json!({ "ok": true, "unlocked": true, "count": self.unlocked.as_ref().map(|u| u.keys.len()).unwrap_or(0) }))
    }

    fn lock(&mut self) {
        self.unlocked = None;
    }

    fn list(&self) -> Result<Value, PluginError> {
        let unlocked = self.unlocked.as_ref().ok_or_else(|| err("Key vault is locked"))?;
        let keys: Vec<Value> = unlocked.keys.iter().map(metadata).collect();
        Ok(json!({ "keys": keys }))
    }

    fn create(&mut self, params: Value) -> Result<Value, PluginError> {
        let unlocked = self.unlocked.as_mut().ok_or_else(|| err("Key vault is locked"))?;
        let name = str_param(&params, "name")?.trim();
        if name.is_empty() {
            return Err(bad("Name is required"));
        }
        let algorithm = canonical_algorithm(str_param(&params, "algorithm")?)?;
        let generate = bool_param(&params, "generate", true);
        let material = if generate {
            generate_material(algorithm, &params)?
        } else {
            let raw = str_param(&params, "material")?;
            normalize_material(algorithm, raw)?
        };
        let key = StoredKey {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            kind: kind_for(algorithm).to_string(),
            algorithm: algorithm.to_string(),
            material,
            created_at: now_iso(),
        };
        let meta = metadata(&key);
        unlocked.keys.push(key);
        self.persist()?;
        Ok(json!({ "ok": true, "key": meta }))
    }

    fn rename(&mut self, params: Value) -> Result<Value, PluginError> {
        let id = str_param(&params, "id")?;
        let name = str_param(&params, "name")?.trim();
        if name.is_empty() {
            return Err(bad("Name is required"));
        }
        let unlocked = self.unlocked.as_mut().ok_or_else(|| err("Key vault is locked"))?;
        let key = unlocked
            .keys
            .iter_mut()
            .find(|key| key.id == id)
            .ok_or_else(|| bad("Unknown key id"))?;
        key.name = name.to_string();
        self.persist()?;
        Ok(json!({ "ok": true }))
    }

    fn delete(&mut self, params: Value) -> Result<Value, PluginError> {
        let id = str_param(&params, "id")?;
        if !bool_param(&params, "confirm", false) {
            return Err(bad("Deletion requires confirm=true"));
        }
        let unlocked = self.unlocked.as_mut().ok_or_else(|| err("Key vault is locked"))?;
        let before = unlocked.keys.len();
        unlocked.keys.retain(|key| key.id != id);
        if unlocked.keys.len() == before {
            return Err(bad("Unknown key id"));
        }
        self.persist()?;
        Ok(json!({ "ok": true }))
    }

    fn import_pem(&mut self, params: Value) -> Result<Value, PluginError> {
        let name = str_param(&params, "name")?.trim();
        if name.is_empty() {
            return Err(bad("Name is required"));
        }
        let pem = str_param(&params, "pem")?;
        let algorithm = infer_pem_algorithm(pem)?;
        let key = StoredKey {
            id: Uuid::new_v4().to_string(),
            name: name.to_string(),
            kind: kind_for(algorithm).to_string(),
            algorithm: algorithm.to_string(),
            material: pem.trim().to_string(),
            created_at: now_iso(),
        };
        let meta = metadata(&key);
        self.unlocked.as_mut().ok_or_else(|| err("Key vault is locked"))?.keys.push(key);
        self.persist()?;
        Ok(json!({ "ok": true, "key": meta }))
    }

    fn export(&self, params: Value) -> Result<Value, PluginError> {
        if !bool_param(&params, "confirm", false) {
            return Err(bad("Export requires confirm=true"));
        }
        let id = str_param(&params, "id")?;
        let key = self.material(id)?;
        Ok(json!({
            "id": key.id,
            "name": key.name,
            "algorithm": key.algorithm,
            "material": key.material
        }))
    }

    fn change_password(&mut self, params: Value) -> Result<Value, PluginError> {
        let unlocked = self.unlocked.as_mut().ok_or_else(|| err("Key vault is locked"))?;
        let current = require_password(&params, "currentPassword")?;
        let next = require_password(&params, "newPassword")?;
        let current_kek = derive_kek_with_salt(&current, &unlocked.salt)?;
        if current_kek != unlocked.kek {
            return Err(err("Current master password is wrong"));
        }
        let (kek, salt) = derive_kek(&next)?;
        unlocked.kek = kek;
        unlocked.salt = salt;
        self.persist()?;
        Ok(json!({ "ok": true }))
    }

    fn generate_key(&mut self, params: Value) -> Result<Value, PluginError> {
        let algorithm = canonical_algorithm(str_param(&params, "algorithm")?)?;
        if matches!(algorithm, "rsa-pem" | "sm2") {
            return Err(bad("Use generate-keypair for RSA and SM2"));
        }
        let save = bool_param(&params, "save", false);
        let name = opt_str(&params, "name").unwrap_or("key").trim();
        let material = generate_material(algorithm, &params)?;
        let mut response = json!({
            "algorithm": algorithm,
            "saved": false
        });
        if save {
            if name.is_empty() {
                return Err(bad("Name is required to save"));
            }
            let key = StoredKey {
                id: Uuid::new_v4().to_string(),
                name: name.to_string(),
                kind: kind_for(algorithm).to_string(),
                algorithm: algorithm.to_string(),
                material,
                created_at: now_iso(),
            };
            let meta = metadata(&key);
            self.unlocked.as_mut().ok_or_else(|| err("Key vault is locked"))?.keys.push(key);
            self.persist()?;
            response["saved"] = json!(true);
            response["key"] = meta;
        } else {
            response["material"] = json!(material);
        }
        Ok(response)
    }

    fn generate_keypair(&mut self, params: Value) -> Result<Value, PluginError> {
        let algorithm = str_param(&params, "algorithm")?;
        let save = bool_param(&params, "save", false);
        let name = opt_str(&params, "name").unwrap_or("keypair").trim();
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
            if name.is_empty() {
                return Err(bad("Name is required to save"));
            }
            let key = StoredKey {
                id: Uuid::new_v4().to_string(),
                name: name.to_string(),
                kind: kind_for(stored_alg).to_string(),
                algorithm: stored_alg.to_string(),
                material: private,
                created_at: now_iso(),
            };
            let meta = metadata(&key);
            self.unlocked.as_mut().ok_or_else(|| err("Key vault is locked"))?.keys.push(key);
            self.persist()?;
            response["saved"] = json!(true);
            response["key"] = meta;
        } else {
            response["privateKey"] = json!(private);
        }
        Ok(response)
    }

    fn persist(&self) -> Result<(), PluginError> {
        let unlocked = self.unlocked.as_ref().ok_or_else(|| err("Key vault is locked"))?;
        let path = vault_path()?;
        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|error| err(error.to_string()))?;
        }
        let file = VaultFile { keys: unlocked.keys.clone() };
        let plain = serde_json::to_vec(&file).map_err(|error| err(error.to_string()))?;
        let cipher = Aes256Gcm::new_from_slice(&unlocked.kek).map_err(|_| err("Failed to init vault cipher"))?;
        let mut nonce_bytes = [0u8; 12];
        rand::thread_rng().fill_bytes(&mut nonce_bytes);
        let nonce = Nonce::from_slice(&nonce_bytes);
        let ciphertext = cipher.encrypt(nonce, plain.as_ref()).map_err(|_| err("Failed to encrypt vault"))?;
        let mut out = Vec::with_capacity(4 + 1 + 16 + 12 + 4 + ciphertext.len());
        out.extend_from_slice(MAGIC);
        out.push(VERSION);
        out.extend_from_slice(&unlocked.salt);
        out.extend_from_slice(&nonce_bytes);
        out.extend_from_slice(&(ciphertext.len() as u32).to_be_bytes());
        out.extend_from_slice(&ciphertext);
        fs::write(&path, out).map_err(|error| err(error.to_string()))
    }
}

struct ParsedFile {
    salt: [u8; 16],
    nonce: [u8; 12],
    ciphertext: Vec<u8>,
}

fn parse_file(bytes: &[u8]) -> Result<ParsedFile, PluginError> {
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
    if rest.len() != len {
        return Err(err("Vault ciphertext length mismatch"));
    }
    Ok(ParsedFile { salt, nonce, ciphertext: rest.to_vec() })
}

fn vault_path() -> Result<PathBuf, PluginError> {
    let base = dirs::data_dir().ok_or_else(|| err("Cannot resolve user data directory"))?;
    Ok(base.join(PLUGIN_ID).join("keystore"))
}

fn require_password(params: &Value, key: &str) -> Result<String, PluginError> {
    let password = str_param(params, key)?;
    if password.chars().count() < 8 {
        return Err(bad("Master password must be at least 8 characters"));
    }
    Ok(password.to_string())
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
        "aes-256" => "aes-256",
        "sm4-128" => "sm4-128",
        "hmac" | "hmac-sha256" => "hmac-sha256",
        "hmac-sm3" => "hmac-sm3",
        "rsa" | "rsa-pem" | "rsa-2048" => "rsa-pem",
        "sm2" => "sm2",
        _ => return Err(bad("Unsupported algorithm")),
    })
}

fn rsa_bits(params: &Value) -> Result<usize, PluginError> {
    let bits = params
        .get("bits")
        .and_then(|value| value.as_u64().or_else(|| value.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(2048) as usize;
    match bits {
        1024 | 2048 | 3072 | 4096 => Ok(bits),
        _ => Err(bad("RSA bits must be 1024, 2048, 3072, or 4096")),
    }
}

fn rsa_pem_format(params: &Value) -> Result<&'static str, PluginError> {
    match opt_str(params, "format").unwrap_or("pkcs8").trim().to_ascii_lowercase().as_str() {
        "pkcs8" | "pkcs#8" | "spki" => Ok("pkcs8"),
        "pkcs1" | "pkcs#1" | "openssl" => Ok("pkcs1"),
        _ => Err(bad("RSA format must be pkcs8 or pkcs1")),
    }
}

fn generate_rsa_pem(bits: usize, format: &str) -> Result<(String, String), PluginError> {
    let mut rng = rand::thread_rng();
    let private_key = rsa::RsaPrivateKey::new(&mut rng, bits).map_err(|error| err(error.to_string()))?;
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
            let mut bytes = vec![0u8; 16];
            rng.fill_bytes(&mut bytes);
            Ok(hex::encode(bytes))
        }
        "aes-256" | "hmac" | "hmac-sha256" | "hmac-sm3" => {
            let mut bytes = vec![0u8; 32];
            rng.fill_bytes(&mut bytes);
            Ok(hex::encode(bytes))
        }
        "rsa" | "rsa-pem" | "rsa-2048" => Ok(generate_rsa_pem(rsa_bits(params)?, rsa_pem_format(params)?)?.1),
        "sm2" => Ok(generate_sm2_pair().1),
        _ => Err(bad("Cannot generate this algorithm; import material instead")),
    }
}

fn normalize_material(algorithm: &str, raw: &str) -> Result<String, PluginError> {
    let trimmed = raw.trim();
    if matches!(algorithm, "rsa-pem" | "sm2") {
        if trimmed.is_empty() {
            return Err(bad("Material is required"));
        }
        if algorithm == "rsa-pem" {
            infer_pem_algorithm(trimmed)?;
        }
        return Ok(trimmed.to_string());
    }
    let bytes = decode_key_bytes(trimmed)?;
    let expected = match algorithm {
        "aes-128" | "sm4-128" => 16,
        "aes-256" => 32,
        "hmac" | "hmac-sha256" | "hmac-sm3" => 0,
        _ => return Err(bad("Unsupported algorithm")),
    };
    if expected != 0 && bytes.len() != expected {
        return Err(bad(format!("Key length must be {expected} bytes")));
    }
    if bytes.is_empty() {
        return Err(bad("Material is required"));
    }
    Ok(hex::encode(bytes))
}

pub fn decode_key_bytes(raw: &str) -> Result<Vec<u8>, PluginError> {
    let trimmed = raw.trim();
    if let Ok(bytes) = hex::decode(trimmed) {
        if !bytes.is_empty() {
            return Ok(bytes);
        }
    }
    B64.decode(trimmed.as_bytes()).map_err(|_| bad("Key material must be hex or base64"))
}

fn infer_pem_algorithm(pem: &str) -> Result<&'static str, PluginError> {
    let parsed = pem::parse(pem.as_bytes()).map_err(|_| bad("Invalid PEM"))?;
    let tag = parsed.tag();
    if tag.contains("CERTIFICATE") {
        return Err(bad("Do not store certificates in the key vault; use the cert tool"));
    }
    if tag.contains("PRIVATE KEY") || tag.contains("RSA PRIVATE") || tag.contains("PUBLIC KEY") {
        return Ok("rsa-pem");
    }
    Err(bad("PEM must be an RSA private or public key for the asymmetric cipher tool"))
}

fn kind_for(algorithm: &str) -> &'static str {
    match algorithm {
        "rsa-pem" | "sm2" => "asymmetric",
        _ => "symmetric",
    }
}

fn metadata(key: &StoredKey) -> Value {
    json!({
        "id": key.id,
        "name": key.name,
        "kind": key.kind,
        "algorithm": key.algorithm,
        "fingerprint": fingerprint(&key.material),
        "createdAt": key.created_at
    })
}

fn fingerprint(material: &str) -> String {
    let digest = Sha256::digest(material.as_bytes());
    digest.iter().take(8).map(|byte| format!("{byte:02x}")).collect::<Vec<_>>().join(":")
}

fn now_iso() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let secs = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
    format!("{secs}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn rsa_bits_accepts_common_sizes() {
        assert_eq!(rsa_bits(&json!({})).unwrap(), 2048);
        assert_eq!(rsa_bits(&json!({ "bits": 1024 })).unwrap(), 1024);
        assert_eq!(rsa_bits(&json!({ "bits": "4096" })).unwrap(), 4096);
        assert!(rsa_bits(&json!({ "bits": 512 })).is_err());
    }

    #[test]
    fn rsa_pem_format_accepts_aliases() {
        assert_eq!(rsa_pem_format(&json!({})).unwrap(), "pkcs8");
        assert_eq!(rsa_pem_format(&json!({ "format": "PKCS#1" })).unwrap(), "pkcs1");
        assert_eq!(rsa_pem_format(&json!({ "format": "openssl" })).unwrap(), "pkcs1");
        assert!(rsa_pem_format(&json!({ "format": "der" })).is_err());
    }

    #[test]
    fn generate_rsa_pem_uses_requested_headers() {
        let (public, private) = generate_rsa_pem(1024, "pkcs8").unwrap();
        assert!(private.contains("BEGIN PRIVATE KEY"));
        assert!(!private.contains("BEGIN RSA PRIVATE KEY"));
        assert!(public.contains("BEGIN PUBLIC KEY"));

        let (public, private) = generate_rsa_pem(1024, "pkcs1").unwrap();
        assert!(private.contains("BEGIN RSA PRIVATE KEY"));
        assert!(public.contains("BEGIN RSA PUBLIC KEY"));
    }

    #[test]
    fn generate_material_symmetric_hex_lengths() {
        let empty = json!({});
        assert_eq!(generate_material("aes-128", &empty).unwrap().len(), 32);
        assert_eq!(generate_material("sm4-128", &empty).unwrap().len(), 32);
        assert_eq!(generate_material("aes-256", &empty).unwrap().len(), 64);
        assert_eq!(generate_material("hmac-sha256", &empty).unwrap().len(), 64);
        assert_eq!(generate_material("hmac-sm3", &empty).unwrap().len(), 64);
        assert!(canonical_algorithm("rsa").ok().is_some());
    }
}
