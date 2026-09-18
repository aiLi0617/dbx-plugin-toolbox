use aes::Aes128;
use aes::Aes256;
use aes_gcm::aead::{Aead, KeyInit as GcmKeyInit};
use aes_gcm::{Aes128Gcm, Aes256Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use cbc::{Decryptor as CbcDecryptor, Encryptor as CbcEncryptor};
use cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use crc32fast::Hasher as Crc32;
use dbx_plugin_sdk::PluginError;
use hmac::{Hmac, Mac as HmacMac};
use md5::Md5;
use rand::RngCore;
use rsa::pkcs1::{DecodeRsaPrivateKey, DecodeRsaPublicKey};
use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};
use rsa::{Oaep, Pkcs1v15Encrypt, RsaPrivateKey, RsaPublicKey};
use serde_json::{json, Map, Value};
use sha1::Sha1;
use sha2::{Digest, Sha256, Sha512};
use sm3::Sm3;
use x509_parser::prelude::*;

use crate::helpers::{bad, bool_param, err, opt_str, str_param, u32_param};
use crate::keystore::{decode_key_bytes, Vault};

type HmacSha256 = Hmac<Sha256>;
type HmacSm3 = Hmac<Sm3>;
type Sm4CbcEnc = CbcEncryptor<sm4::Sm4>;
type Sm4CbcDec = CbcDecryptor<sm4::Sm4>;
type Aes128CbcEnc = CbcEncryptor<Aes128>;
type Aes128CbcDec = CbcDecryptor<Aes128>;
type Aes256CbcEnc = CbcEncryptor<Aes256>;
type Aes256CbcDec = CbcDecryptor<Aes256>;

pub fn json_op(params: Value) -> Result<Value, PluginError> {
    let action = str_param(&params, "action")?;
    let text = str_param(&params, "text")?;
    let indent = u32_param(&params, "indent", 2).clamp(0, 8) as usize;
    let sort_keys = bool_param(&params, "sortKeys", false);
    match action {
        "validate" => match serde_json::from_str::<Value>(text) {
            Ok(_) => Ok(json!({ "ok": true, "message": "Valid JSON" })),
            Err(error) => Ok(json!({ "ok": false, "message": error.to_string(), "line": error.line(), "column": error.column() })),
        },
        "format" => {
            let mut value: Value = serde_json::from_str(text).map_err(json_error)?;
            if sort_keys {
                sort_value(&mut value);
            }
            let formatted = pretty(&value, indent)?;
            Ok(json!({ "ok": true, "text": formatted }))
        }
        "minify" => {
            let mut value: Value = serde_json::from_str(text).map_err(json_error)?;
            if sort_keys {
                sort_value(&mut value);
            }
            Ok(json!({ "ok": true, "text": serde_json::to_string(&value).map_err(|e| err(e.to_string()))? }))
        }
        _ => Err(bad("action must be validate, format, or minify")),
    }
}

pub fn hash_op(params: Value) -> Result<Value, PluginError> {
    let algorithm = str_param(&params, "algorithm")?.to_ascii_lowercase();
    let text = str_param(&params, "text")?;
    let bytes = text.as_bytes();
    let digest = match algorithm.as_str() {
        "md5" => hex::encode(Md5::digest(bytes)),
        "sha-1" | "sha1" => hex::encode(Sha1::digest(bytes)),
        "sha-256" | "sha256" => hex::encode(Sha256::digest(bytes)),
        "sha-512" | "sha512" => hex::encode(Sha512::digest(bytes)),
        "sm3" => hex::encode(Sm3::digest(bytes)),
        "crc32" => format!("{:08x}", { let mut hasher = Crc32::new(); hasher.update(bytes); hasher.finalize() }),
        _ => return Err(bad("Unsupported hash algorithm")),
    };
    Ok(json!({ "ok": true, "digest": digest, "algorithm": algorithm }))
}

pub fn crypto_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let action = str_param(&params, "action")?.to_string();
    match action.as_str() {
        "encrypt" | "decrypt" => symmetric(vault, action.as_str(), params),
        "hmac" => hmac_op(vault, params),
        "xor" => xor_op(vault, params),
        "rsa" => rsa_op(vault, params),
        "sm2" => sm2_op(vault, params),
        "jwt-sign" => jwt_sign(vault, params),
        _ => Err(bad("Unknown crypto action")),
    }
}

pub fn cert_op(params: Value) -> Result<Value, PluginError> {
    let pem_text = str_param(&params, "pem")?;
    if pem_text.contains("ssh-rsa") || pem_text.contains("ssh-ed25519") || pem_text.contains("ecdsa-sha2") {
        return ssh_fingerprint(pem_text);
    }
    let parsed = ::pem::parse(pem_text.as_bytes()).map_err(|_| bad("Invalid PEM"))?;
    if parsed.tag().contains("CERTIFICATE") {
        let (_rest, cert) = X509Certificate::from_der(parsed.contents()).map_err(|error| err(error.to_string()))?;
        let subject = cert.subject().to_string();
        let issuer = cert.issuer().to_string();
        let not_before = cert.validity().not_before.to_string();
        let not_after = cert.validity().not_after.to_string();
        let serial = cert.raw_serial_as_string();
        let algo = cert.signature_algorithm.algorithm.to_string();
        return Ok(json!({
            "ok": true,
            "kind": "certificate",
            "subject": subject,
            "issuer": issuer,
            "serial": serial,
            "notBefore": not_before,
            "notAfter": not_after,
            "signatureAlgorithm": algo
        }));
    }
    Ok(json!({
        "ok": true,
        "kind": "pem",
        "tag": parsed.tag(),
        "bytes": parsed.contents().len()
    }))
}

fn symmetric(vault: &Vault, action: &str, params: Value) -> Result<Value, PluginError> {
    let algorithm = str_param(&params, "algorithm")?;
    let mode = opt_str(&params, "mode").unwrap_or(if algorithm.starts_with("sm4") { "cbc" } else { "gcm" });
    let key = resolve_key(vault, &params, algorithm)?;
    if action == "encrypt" {
        let plaintext = str_param(&params, "text")?.as_bytes();
        let packed = match (algorithm, mode) {
            ("aes-128", "gcm") | ("aes", "gcm") if key.len() == 16 => aes128_gcm_encrypt(&key, plaintext)?,
            ("aes-256", "gcm") | ("aes", "gcm") if key.len() == 32 => aes256_gcm_encrypt(&key, plaintext)?,
            ("aes-128", "cbc") if key.len() == 16 => cbc_encrypt_aes128(&key, plaintext)?,
            ("aes-256", "cbc") | ("aes", "cbc") if key.len() == 32 => cbc_encrypt_aes256(&key, plaintext)?,
            ("sm4-128", _) | ("sm4", _) => sm4_encrypt(&key, plaintext, mode)?,
            _ => return Err(bad("Unsupported algorithm/mode or key length")),
        };
        Ok(json!({ "ok": true, "text": packed }))
    } else {
        let packed = str_param(&params, "text")?;
        let plain = match (algorithm, mode) {
            ("aes-128", "gcm") | ("aes", "gcm") if key.len() == 16 => aes128_gcm_decrypt(&key, packed)?,
            ("aes-256", "gcm") | ("aes", "gcm") if key.len() == 32 => aes256_gcm_decrypt(&key, packed)?,
            ("aes-128", "cbc") if key.len() == 16 => cbc_decrypt_aes128(&key, packed)?,
            ("aes-256", "cbc") | ("aes", "cbc") if key.len() == 32 => cbc_decrypt_aes256(&key, packed)?,
            ("sm4-128", _) | ("sm4", _) => sm4_decrypt(&key, packed, mode)?,
            _ => return Err(bad("Unsupported algorithm/mode or key length")),
        };
        let text = String::from_utf8(plain).unwrap_or_else(|e| hex::encode(e.into_bytes()));
        Ok(json!({ "ok": true, "text": text }))
    }
}

fn hmac_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let algorithm = opt_str(&params, "algorithm").unwrap_or("hmac-sha256");
    let key = resolve_key(vault, &params, algorithm)?;
    let text = str_param(&params, "text")?.as_bytes();
    let digest = match algorithm {
        "hmac-sm3" | "sm3" => {
            let mut mac: HmacSm3 = HmacMac::new_from_slice(&key).map_err(|_| bad("Invalid HMAC key"))?;
            mac.update(text);
            hex::encode(mac.finalize().into_bytes())
        }
        _ => {
            let mut mac: HmacSha256 = HmacMac::new_from_slice(&key).map_err(|_| bad("Invalid HMAC key"))?;
            mac.update(text);
            hex::encode(mac.finalize().into_bytes())
        }
    };
    Ok(json!({ "ok": true, "digest": digest }))
}

fn xor_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let key = resolve_key(vault, &params, "xor")?;
    if key.is_empty() {
        return Err(bad("XOR key is required"));
    }
    let text = str_param(&params, "text")?;
    let decode_input = bool_param(&params, "inputHex", false);
    let source = if decode_input {
        hex::decode(text.trim()).map_err(|_| bad("Input is not hex"))?
    } else {
        text.as_bytes().to_vec()
    };
    let out: Vec<u8> = source.iter().enumerate().map(|(i, b)| b ^ key[i % key.len()]).collect();
    Ok(json!({ "ok": true, "text": hex::encode(&out), "utf8": String::from_utf8_lossy(&out) }))
}

fn rsa_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let op = str_param(&params, "op")?;
    let pem = resolve_text_key(vault, &params)?;
    let text = str_param(&params, "text")?;
    let padding = rsa_padding(&params)?;
    match op {
        "encrypt" => {
            let public = decode_rsa_public(&pem)?;
            let mut rng = rand::thread_rng();
            let cipher = if padding == "pkcs1" {
                public.encrypt(&mut rng, Pkcs1v15Encrypt, text.as_bytes())
            } else {
                public.encrypt(&mut rng, Oaep::new::<Sha256>(), text.as_bytes())
            }
            .map_err(rsa_crypto_error)?;
            Ok(json!({ "ok": true, "text": B64.encode(cipher), "padding": padding }))
        }
        "decrypt" => {
            let private = decode_rsa_private(&pem)?;
            let data = B64.decode(text.trim()).map_err(|_| bad("Ciphertext must be base64"))?;
            let plain = if padding == "pkcs1" {
                private.decrypt(Pkcs1v15Encrypt, &data)
            } else {
                private.decrypt(Oaep::new::<Sha256>(), &data)
            }
            .map_err(rsa_crypto_error)?;
            Ok(json!({ "ok": true, "text": String::from_utf8_lossy(&plain), "padding": padding }))
        }
        _ => Err(bad("op must be encrypt or decrypt")),
    }
}

fn rsa_padding(params: &Value) -> Result<&'static str, PluginError> {
    match opt_str(params, "padding").unwrap_or("oaep").trim().to_ascii_lowercase().as_str() {
        "oaep" | "rsa-oaep" | "oaep-sha256" => Ok("oaep"),
        "pkcs1" | "pkcs1v15" | "pkcs1-v1.5" | "v1.5" => Ok("pkcs1"),
        _ => Err(bad("RSA padding must be oaep or pkcs1")),
    }
}

fn rsa_crypto_error(error: rsa::Error) -> PluginError {
    match error {
        rsa::Error::MessageTooLong => bad("Plaintext is too long for this RSA key and padding"),
        other => err(other.to_string()),
    }
}

fn sm2_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let op = str_param(&params, "op")?;
    let key = resolve_text_key(vault, &params)?;
    let text = str_param(&params, "text")?;
    match op {
        "encrypt" => {
            let cipher = smcrypto::sm2::Encrypt::new(&key).encrypt_base64(text.as_bytes());
            Ok(json!({ "ok": true, "text": cipher }))
        }
        "decrypt" => {
            let plain = smcrypto::sm2::Decrypt::new(&key).decrypt_base64(text.trim());
            Ok(json!({ "ok": true, "text": String::from_utf8_lossy(&plain) }))
        }
        _ => Err(bad("op must be encrypt or decrypt")),
    }
}

fn jwt_sign(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let key = resolve_key(vault, &params, "hmac-sha256")?;
    let header = opt_str(&params, "header").unwrap_or("{\"alg\":\"HS256\",\"typ\":\"JWT\"}");
    let payload = str_param(&params, "text")?;
    let h = b64url(header.as_bytes());
    let p = b64url(payload.as_bytes());
    let signing = format!("{h}.{p}");
    let mut mac: HmacSha256 = HmacMac::new_from_slice(&key).map_err(|_| bad("Invalid HMAC key"))?;
    mac.update(signing.as_bytes());
    let sig = b64url(&mac.finalize().into_bytes());
    Ok(json!({ "ok": true, "text": format!("{signing}.{sig}") }))
}

fn ssh_fingerprint(line: &str) -> Result<Value, PluginError> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 2 {
        return Err(bad("OpenSSH public key needs type and base64 body"));
    }
    let body = B64.decode(parts[1].as_bytes()).map_err(|_| bad("Invalid OpenSSH key body"))?;
    let sha256 = Sha256::digest(&body);
    let md5 = Md5::digest(&body);
    let md5_colon = md5.iter().map(|b| format!("{b:02x}")).collect::<Vec<_>>().join(":");
    Ok(json!({
        "ok": true,
        "kind": "ssh",
        "type": parts[0],
        "comment": parts.get(2).copied().unwrap_or(""),
        "fingerprintSha256": format!("SHA256:{}", B64.encode(sha256)),
        "fingerprintMd5": md5_colon,
        "bytes": body.len()
    }))
}

fn resolve_key(vault: &Vault, params: &Value, _algorithm: &str) -> Result<Vec<u8>, PluginError> {
    if let Some(id) = opt_str(params, "keyId") {
        if !id.is_empty() {
            return decode_key_bytes(&vault.material(id)?.material);
        }
    }
    let material = opt_str(params, "keyMaterial").unwrap_or("");
    if material.is_empty() {
        return Err(bad("Provide keyId or keyMaterial"));
    }
    decode_key_bytes(material)
}

fn resolve_text_key(vault: &Vault, params: &Value) -> Result<String, PluginError> {
    if let Some(id) = opt_str(params, "keyId") {
        if !id.is_empty() {
            return Ok(vault.material(id)?.material.clone());
        }
    }
    let material = opt_str(params, "keyMaterial").unwrap_or("");
    if material.is_empty() {
        return Err(bad("Provide keyId or keyMaterial"));
    }
    Ok(material.to_string())
}

fn aes128_gcm_encrypt(key: &[u8], plaintext: &[u8]) -> Result<String, PluginError> {
    let cipher = Aes128Gcm::new_from_slice(key).map_err(|_| bad("Invalid AES key"))?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher.encrypt(nonce, plaintext).map_err(|_| err("AES-GCM encrypt failed"))?;
    let mut packed = Vec::with_capacity(12 + ct.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ct);
    Ok(B64.encode(packed))
}

fn aes256_gcm_encrypt(key: &[u8], plaintext: &[u8]) -> Result<String, PluginError> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| bad("Invalid AES key"))?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher.encrypt(nonce, plaintext).map_err(|_| err("AES-GCM encrypt failed"))?;
    let mut packed = Vec::with_capacity(12 + ct.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ct);
    Ok(B64.encode(packed))
}

fn aes128_gcm_decrypt(key: &[u8], packed: &str) -> Result<Vec<u8>, PluginError> {
    let data = B64.decode(packed.trim()).map_err(|_| bad("Ciphertext must be base64"))?;
    if data.len() < 13 {
        return Err(bad("Ciphertext is too short"));
    }
    let cipher = Aes128Gcm::new_from_slice(key).map_err(|_| bad("Invalid AES key"))?;
    let nonce = Nonce::from_slice(&data[..12]);
    cipher.decrypt(nonce, &data[12..]).map_err(|_| err("AES-GCM decrypt failed"))
}

fn aes256_gcm_decrypt(key: &[u8], packed: &str) -> Result<Vec<u8>, PluginError> {
    let data = B64.decode(packed.trim()).map_err(|_| bad("Ciphertext must be base64"))?;
    if data.len() < 13 {
        return Err(bad("Ciphertext is too short"));
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| bad("Invalid AES key"))?;
    let nonce = Nonce::from_slice(&data[..12]);
    cipher.decrypt(nonce, &data[12..]).map_err(|_| err("AES-GCM decrypt failed"))
}

fn cbc_encrypt_aes128(key: &[u8], plaintext: &[u8]) -> Result<String, PluginError> {
    let mut iv = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut iv);
    let encryptor = Aes128CbcEnc::new(key.into(), &iv.into());
    let ct = encryptor.encrypt_padded_vec_mut::<Pkcs7>(plaintext);
    let mut packed = Vec::from(iv);
    packed.extend_from_slice(&ct);
    Ok(B64.encode(packed))
}

fn cbc_decrypt_aes128(key: &[u8], packed: &str) -> Result<Vec<u8>, PluginError> {
    let data = B64.decode(packed.trim()).map_err(|_| bad("Ciphertext must be base64"))?;
    if data.len() < 32 {
        return Err(bad("Ciphertext is too short"));
    }
    let decryptor = Aes128CbcDec::new(key.into(), data[..16].into());
    decryptor
        .decrypt_padded_vec_mut::<Pkcs7>(&data[16..])
        .map_err(|_| err("AES-CBC decrypt failed"))
}

fn cbc_encrypt_aes256(key: &[u8], plaintext: &[u8]) -> Result<String, PluginError> {
    let mut iv = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut iv);
    let encryptor = Aes256CbcEnc::new(key.into(), &iv.into());
    let ct = encryptor.encrypt_padded_vec_mut::<Pkcs7>(plaintext);
    let mut packed = Vec::from(iv);
    packed.extend_from_slice(&ct);
    Ok(B64.encode(packed))
}

fn cbc_decrypt_aes256(key: &[u8], packed: &str) -> Result<Vec<u8>, PluginError> {
    let data = B64.decode(packed.trim()).map_err(|_| bad("Ciphertext must be base64"))?;
    if data.len() < 32 {
        return Err(bad("Ciphertext is too short"));
    }
    let decryptor = Aes256CbcDec::new(key.into(), data[..16].into());
    decryptor
        .decrypt_padded_vec_mut::<Pkcs7>(&data[16..])
        .map_err(|_| err("AES-CBC decrypt failed"))
}

fn sm4_encrypt(key: &[u8], plaintext: &[u8], mode: &str) -> Result<String, PluginError> {
    if key.len() != 16 {
        return Err(bad("SM4 key must be 16 bytes"));
    }
    if mode == "ecb" {
        use cipher::KeyInit;
        type Sm4EcbEnc = ecb::Encryptor<sm4::Sm4>;
        let encryptor = Sm4EcbEnc::new(key.into());
        let ct = encryptor.encrypt_padded_vec_mut::<Pkcs7>(plaintext);
        return Ok(B64.encode(ct));
    }
    let mut iv = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut iv);
    let encryptor = Sm4CbcEnc::new(key.into(), &iv.into());
    let ct = encryptor.encrypt_padded_vec_mut::<Pkcs7>(plaintext);
    let mut packed = Vec::from(iv);
    packed.extend_from_slice(&ct);
    Ok(B64.encode(packed))
}

fn sm4_decrypt(key: &[u8], packed: &str, mode: &str) -> Result<Vec<u8>, PluginError> {
    if key.len() != 16 {
        return Err(bad("SM4 key must be 16 bytes"));
    }
    let data = B64.decode(packed.trim()).map_err(|_| bad("Ciphertext must be base64"))?;
    if mode == "ecb" {
        use cipher::KeyInit;
        type Sm4EcbDec = ecb::Decryptor<sm4::Sm4>;
        let decryptor = Sm4EcbDec::new(key.into());
        return decryptor
            .decrypt_padded_vec_mut::<Pkcs7>(&data)
            .map_err(|_| err("SM4-ECB decrypt failed"));
    }
    if data.len() < 32 {
        return Err(bad("Ciphertext is too short"));
    }
    let decryptor = Sm4CbcDec::new(key.into(), data[..16].into());
    decryptor
        .decrypt_padded_vec_mut::<Pkcs7>(&data[16..])
        .map_err(|_| err("SM4-CBC decrypt failed"))
}

fn decode_rsa_private(pem: &str) -> Result<RsaPrivateKey, PluginError> {
    let trimmed = pem.trim();
    RsaPrivateKey::from_pkcs8_pem(trimmed)
        .or_else(|_| RsaPrivateKey::from_pkcs1_pem(trimmed))
        .map_err(|_| bad("Invalid RSA private key PEM (PKCS#8 or PKCS#1)"))
}

fn decode_rsa_public(pem: &str) -> Result<RsaPublicKey, PluginError> {
    let trimmed = pem.trim();
    RsaPublicKey::from_public_key_pem(trimmed)
        .or_else(|_| RsaPublicKey::from_pkcs1_pem(trimmed))
        .or_else(|_| RsaPrivateKey::from_pkcs8_pem(trimmed).map(|k| RsaPublicKey::from(&k)))
        .or_else(|_| RsaPrivateKey::from_pkcs1_pem(trimmed).map(|k| RsaPublicKey::from(&k)))
        .map_err(|_| bad("Invalid RSA public/private PEM (PKCS#8 or PKCS#1)"))
}

fn json_error(error: serde_json::Error) -> PluginError {
    err(format!("{} (line {}, column {})", error, error.line(), error.column()))
}

fn sort_value(value: &mut Value) {
    match value {
        Value::Object(map) => {
            let mut entries: Vec<(String, Value)> = std::mem::take(map).into_iter().collect();
            entries.sort_by(|a, b| a.0.cmp(&b.0));
            let mut sorted = Map::new();
            for (key, mut child) in entries {
                sort_value(&mut child);
                sorted.insert(key, child);
            }
            *map = sorted;
        }
        Value::Array(items) => items.iter_mut().for_each(sort_value),
        _ => {}
    }
}

fn pretty(value: &Value, indent: usize) -> Result<String, PluginError> {
    let mut buf = Vec::new();
    let indent_bytes = vec![b' '; indent];
    let mut ser = serde_json::Serializer::with_formatter(
        &mut buf,
        serde_json::ser::PrettyFormatter::with_indent(&indent_bytes),
    );
    serde::Serialize::serialize(value, &mut ser).map_err(|e| err(e.to_string()))?;
    String::from_utf8(buf).map_err(|e| err(e.to_string()))
}

fn b64url(bytes: &[u8]) -> String {
    base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(bytes)
}
