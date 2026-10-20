use std::collections::HashMap;
use std::time::{Duration, Instant};

use aes::{Aes128, Aes192, Aes256};
use aes_gcm::aead::{Aead, KeyInit as GcmKeyInit, Payload};
use aes_gcm::{Aes128Gcm, Aes256Gcm, Nonce};
use aes_gcm_siv::{Aes256GcmSiv, Nonce as GcmSivNonce};
use aes_kw::{KekAes128, KekAes192, KekAes256};
use aes_siv::{Aes256SivAead, Nonce as SivNonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use cbc::{Decryptor as CbcDecryptor, Encryptor as CbcEncryptor};
use ccm::{
    consts::{U13, U16},
    Ccm,
};
use chacha20poly1305::{ChaCha20Poly1305, XChaCha20Poly1305};
use cipher::{
    block_padding::Pkcs7, AsyncStreamCipher, BlockDecryptMut, BlockEncryptMut, KeyIvInit,
    StreamCipher,
};
use cmac::Cmac;
use crc32fast::Hasher as Crc32;
use dbx_plugin_sdk::PluginError;
use fpe::ff1::{FlexibleNumeralString, FF1};
use hkdf::Hkdf;
use hmac::{digest::KeyInit as HmacKeyInit, Hmac, Mac as HmacMac};
use hpke::{
    Deserializable as HpkeDeserializable, Kem as HpkeKem, Serializable as HpkeSerializable,
};
use md5::Md5;
use pbkdf2::pbkdf2_hmac;
use rand::RngCore;
use rsa::pkcs1::{DecodeRsaPrivateKey, DecodeRsaPublicKey};
use rsa::pkcs8::{DecodePrivateKey, DecodePublicKey};
use rsa::{Oaep, Pkcs1v15Encrypt, Pkcs1v15Sign, Pss, RsaPrivateKey, RsaPublicKey};
use scrypt::{scrypt, Params as ScryptParams};
use serde_json::{json, Map, Value};
use sha1::Sha1;
use sha2::{Digest, Sha224, Sha256, Sha384, Sha512};
use sha3::Sha3_256;
use sm3::Sm3;
use x509_parser::prelude::*;
use xts_mode::{get_tweak_default, Xts128};
use zeroize::Zeroizing;

use crate::helpers::{bad, bool_param, err, opt_str, str_param, u32_param};
use crate::keystore::{decode_key_bytes, Vault};

type HmacSha1 = Hmac<Sha1>;
type HmacSha256 = Hmac<Sha256>;
type HmacSha384 = Hmac<Sha384>;
type HmacSha512 = Hmac<Sha512>;
type HmacSm3 = Hmac<Sm3>;
type Sm4CbcEnc = CbcEncryptor<sm4::Sm4>;
type Sm4CbcDec = CbcDecryptor<sm4::Sm4>;
type Aes128CbcEnc = CbcEncryptor<Aes128>;
type Aes128CbcDec = CbcDecryptor<Aes128>;
type Aes192CbcEnc = CbcEncryptor<Aes192>;
type Aes192CbcDec = CbcDecryptor<Aes192>;
type Aes256CbcEnc = CbcEncryptor<Aes256>;
type Aes256CbcDec = CbcDecryptor<Aes256>;
type Aes192Gcm = aes_gcm::AesGcm<Aes192, aes_gcm::aead::consts::U12>;
type Aes256Ccm = Ccm<Aes256, U16, U13>;
type Aes256Ctr = ctr::Ctr128BE<Aes256>;
type Aes128Ctr = ctr::Ctr128BE<Aes128>;
type Aes192Ctr = ctr::Ctr128BE<Aes192>;
type Aes128Ofb = ofb::Ofb<Aes128>;
type Aes192Ofb = ofb::Ofb<Aes192>;
type Aes256Ofb = ofb::Ofb<Aes256>;

// Keep sidecar requests bounded even when the UI is bypassed. The browser
// currently limits file hashing to 16 MiB; crypto and certificate operations
// use the same practical ceiling while retaining room for encoded envelopes.
const MAX_JSON_INPUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_HASH_INPUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_CRYPTO_INPUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_PACKED_CRYPTO_BYTES: usize = MAX_CRYPTO_INPUT_BYTES + 64;
const MAX_CERT_INPUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_KEY_INPUT_BYTES: usize = 1024 * 1024;
const MAX_HASH_CHUNK_BYTES: usize = 512 * 1024;
const MAX_HASH_SESSIONS: usize = 8;
const HASH_SESSION_TTL: Duration = Duration::from_secs(5 * 60);

struct HashSession {
    total_bytes: usize,
    last_updated: Instant,
    md5: Md5,
    sha224: Sha224,
    sha3_256: Sha3_256,
    sm3: Sm3,
}

impl Default for HashSession {
    fn default() -> Self {
        Self {
            total_bytes: 0,
            last_updated: Instant::now(),
            md5: Md5::new(),
            sha224: Sha224::new(),
            sha3_256: Sha3_256::new(),
            sm3: Sm3::new(),
        }
    }
}

#[derive(Default)]
pub struct HashSessions {
    sessions: HashMap<String, HashSession>,
}

fn ensure_input_size(value: &str, label: &str, max: usize) -> Result<(), PluginError> {
    if value.len() > max {
        return Err(bad(format!("{label} exceeds the {max} byte input limit")));
    }
    Ok(())
}

fn ensure_bytes_size(value: &[u8], label: &str, max: usize) -> Result<(), PluginError> {
    if value.len() > max {
        return Err(bad(format!("{label} exceeds the {max} byte input limit")));
    }
    Ok(())
}

fn encoded_input_limit(max_bytes: usize, encoding: &str) -> usize {
    match encoding {
        "hex" => max_bytes.saturating_mul(2),
        "base64" => ((max_bytes.saturating_add(2)) / 3).saturating_mul(4),
        _ => max_bytes,
    }
}

fn decode_base64_limited(
    value: &str,
    label: &str,
    max_bytes: usize,
) -> Result<Vec<u8>, PluginError> {
    ensure_input_size(value, label, encoded_input_limit(max_bytes, "base64"))?;
    let bytes = B64
        .decode(value)
        .map_err(|_| bad(format!("{label} must be base64")))?;
    ensure_bytes_size(&bytes, label, max_bytes)?;
    Ok(bytes)
}

pub fn json_op(params: Value) -> Result<Value, PluginError> {
    let action = str_param(&params, "action")?;
    let text = str_param(&params, "text")?;
    ensure_input_size(text, "JSON input", MAX_JSON_INPUT_BYTES)?;
    let indent = u32_param(&params, "indent", 2).clamp(0, 8) as usize;
    let sort_keys = bool_param(&params, "sortKeys", false);
    match action {
        "validate" => match serde_json::from_str::<Value>(text) {
            Ok(_) => Ok(json!({ "ok": true, "message": "Valid JSON" })),
            Err(error) => Ok(
                json!({ "ok": false, "message": error.to_string(), "line": error.line(), "column": error.column() }),
            ),
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
            Ok(
                json!({ "ok": true, "text": serde_json::to_string(&value).map_err(|e| err(e.to_string()))? }),
            )
        }
        _ => Err(bad("action must be validate, format, or minify")),
    }
}

pub fn hash_op(params: Value) -> Result<Value, PluginError> {
    let algorithm = str_param(&params, "algorithm")?.to_ascii_lowercase();
    let decoded;
    let bytes = if let Some(data) = opt_str(&params, "dataBase64") {
        decoded = decode_base64_limited(data, "Hash input", MAX_HASH_INPUT_BYTES)?;
        decoded.as_slice()
    } else {
        let text = str_param(&params, "text")?;
        ensure_input_size(text, "Hash input", MAX_HASH_INPUT_BYTES)?;
        text.as_bytes()
    };
    let digest = match algorithm.as_str() {
        "md5" | "md5-32" => hex::encode(Md5::digest(bytes)),
        "md5-16" => {
            let full = hex::encode(Md5::digest(bytes));
            full[8..24].to_string()
        }
        "sha-1" | "sha1" => hex::encode(Sha1::digest(bytes)),
        "sha-224" | "sha224" => hex::encode(Sha224::digest(bytes)),
        "sha-256" | "sha256" => hex::encode(Sha256::digest(bytes)),
        "sha3" | "sha3-256" | "sha3_256" => hex::encode(Sha3_256::digest(bytes)),
        "sha-384" | "sha384" => hex::encode(Sha384::digest(bytes)),
        "sha-512" | "sha512" => hex::encode(Sha512::digest(bytes)),
        "sm3" => hex::encode(Sm3::digest(bytes)),
        "crc32" => format!("{:08x}", {
            let mut hasher = Crc32::new();
            hasher.update(bytes);
            hasher.finalize()
        }),
        _ => return Err(bad("Unsupported hash algorithm")),
    };
    Ok(json!({ "ok": true, "digest": digest, "algorithm": algorithm }))
}

pub fn hash_stream_op(
    sessions: &mut HashSessions,
    method: &str,
    params: Value,
) -> Result<Value, PluginError> {
    match method {
        "toolbox/hash-stream/begin" => {
            sessions
                .sessions
                .retain(|_, session| session.last_updated.elapsed() < HASH_SESSION_TTL);
            if sessions.sessions.len() >= MAX_HASH_SESSIONS {
                return Err(err("Too many active hash sessions"));
            }
            let session_id = loop {
                let mut id = [0_u8; 16];
                rand::thread_rng().fill_bytes(&mut id);
                let candidate = hex::encode(id);
                if !sessions.sessions.contains_key(&candidate) {
                    break candidate;
                }
            };
            sessions
                .sessions
                .insert(session_id.clone(), HashSession::default());
            Ok(json!({ "ok": true, "sessionId": session_id }))
        }
        "toolbox/hash-stream/update" => {
            let session_id = str_param(&params, "sessionId")?.to_string();
            let data = str_param(&params, "dataBase64")?;
            let bytes = decode_base64_limited(data, "Hash chunk", MAX_HASH_CHUNK_BYTES)?;
            let Some(session) = sessions.sessions.get_mut(&session_id) else {
                return Err(bad("Unknown or expired hash session"));
            };
            let Some(total_bytes) = session.total_bytes.checked_add(bytes.len()) else {
                sessions.sessions.remove(&session_id);
                return Err(bad("Hash input exceeds the input limit"));
            };
            if total_bytes > MAX_HASH_INPUT_BYTES {
                sessions.sessions.remove(&session_id);
                return Err(bad(format!(
                    "Hash input exceeds the {MAX_HASH_INPUT_BYTES} byte input limit"
                )));
            }
            Digest::update(&mut session.md5, &bytes);
            Digest::update(&mut session.sha224, &bytes);
            Digest::update(&mut session.sha3_256, &bytes);
            Digest::update(&mut session.sm3, &bytes);
            session.total_bytes = total_bytes;
            session.last_updated = Instant::now();
            Ok(json!({ "ok": true, "receivedBytes": total_bytes }))
        }
        "toolbox/hash-stream/finalize" => {
            let session_id = str_param(&params, "sessionId")?;
            let Some(session) = sessions.sessions.remove(session_id) else {
                return Err(bad("Unknown or expired hash session"));
            };
            let md5 = hex::encode(session.md5.finalize());
            Ok(json!({
                "ok": true,
                "bytes": session.total_bytes,
                "digests": {
                    "md5-16": &md5[8..24],
                    "md5": md5,
                    "sha-224": hex::encode(session.sha224.finalize()),
                    "sha3-256": hex::encode(session.sha3_256.finalize()),
                    "sm3": hex::encode(session.sm3.finalize()),
                }
            }))
        }
        "toolbox/hash-stream/cancel" => {
            let session_id = str_param(&params, "sessionId")?;
            sessions.sessions.remove(session_id);
            Ok(json!({ "ok": true }))
        }
        _ => Err(PluginError::method_not_found(method)),
    }
}

pub fn crypto_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let action = str_param(&params, "action")?.to_string();
    match action.as_str() {
        "encrypt" | "decrypt" => symmetric(vault, action.as_str(), params),
        "hmac" => hmac_op(vault, params),
        "xor" => xor_op(vault, params),
        "rsa" => rsa_op(vault, params),
        "sm2" => sm2_op(vault, params),
        "modern-aead" => modern_cipher_op(vault, params),
        "kdf" => kdf_op(params),
        "signature" => signature_op(vault, params),
        "specialized" => specialized_crypto_op(vault, params),
        "kem" => kem_op(vault, params),
        "jwt-sign" => jwt_sign(vault, params),
        "jwt-verify" => jwt_verify(vault, params),
        _ => Err(bad("Unknown crypto action")),
    }
}

pub fn cert_op(params: Value) -> Result<Value, PluginError> {
    let pem_text = str_param(&params, "pem")?;
    ensure_input_size(pem_text, "Certificate input", MAX_CERT_INPUT_BYTES)?;
    if pem_text.contains("ssh-rsa")
        || pem_text.contains("ssh-ed25519")
        || pem_text.contains("ecdsa-sha2")
    {
        return ssh_fingerprint(pem_text);
    }
    let parsed = ::pem::parse(pem_text.as_bytes()).map_err(|_| bad("Invalid PEM"))?;
    if parsed.tag().contains("CERTIFICATE") {
        let (_rest, cert) =
            X509Certificate::from_der(parsed.contents()).map_err(|error| err(error.to_string()))?;
        let subject = cert.subject().to_string();
        let issuer = cert.issuer().to_string();
        let not_before = cert.validity().not_before.to_string();
        let not_after = cert.validity().not_after.to_string();
        let serial = cert.raw_serial_as_string();
        let algo = cert.signature_algorithm.algorithm.to_string();
        let fingerprint = Sha256::digest(parsed.contents())
            .iter()
            .map(|byte| format!("{byte:02X}"))
            .collect::<Vec<_>>()
            .join(":");
        let public_key_algorithm = cert.public_key().algorithm.algorithm.to_string();
        let now = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_secs() as i64)
            .unwrap_or(0);
        let not_before_ts = cert.validity().not_before.timestamp();
        let not_after_ts = cert.validity().not_after.timestamp();
        let status = if now < not_before_ts {
            "not-yet-valid"
        } else if now > not_after_ts {
            "expired"
        } else {
            "valid"
        };
        let days_remaining = (not_after_ts - now) / 86_400;
        let mut sans = Vec::new();
        if let Ok(Some(extension)) = cert.subject_alternative_name() {
            for name in &extension.value.general_names {
                let value = match name {
                    GeneralName::DNSName(value) => format!("DNS:{value}"),
                    GeneralName::IPAddress(value) if value.len() == 4 => {
                        format!("IP:{}.{}.{}.{}", value[0], value[1], value[2], value[3])
                    }
                    GeneralName::IPAddress(value) if value.len() == 16 => {
                        let chunks = value
                            .as_chunks::<2>()
                            .0
                            .iter()
                            .map(|chunk| format!("{:x}", u16::from_be_bytes([chunk[0], chunk[1]])))
                            .collect::<Vec<_>>();
                        format!("IP:{}", chunks.join(":"))
                    }
                    GeneralName::URI(value) => format!("URI:{value}"),
                    GeneralName::RFC822Name(value) => format!("Email:{value}"),
                    _ => continue,
                };
                sans.push(value);
            }
        }
        return Ok(json!({
            "ok": true,
            "kind": "certificate",
            "subject": subject,
            "issuer": issuer,
            "serial": serial,
            "notBefore": not_before,
            "notAfter": not_after,
            "signatureAlgorithm": algo,
            "publicKeyAlgorithm": public_key_algorithm,
            "fingerprintSha256": fingerprint,
            "subjectAlternativeNames": sans,
            "status": status,
            "daysRemaining": days_remaining,
            "subjectMatchesIssuer": subject == issuer
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
    let mode = opt_str(&params, "mode").unwrap_or(if algorithm.starts_with("sm4") {
        "cbc"
    } else {
        "gcm"
    });
    let key = resolve_key(vault, &params, algorithm)?;
    if opt_str(&params, "payloadFormat").unwrap_or("packed") == "separate" {
        return symmetric_separate(&key, algorithm, mode, action, &params);
    }
    if opt_str(&params, "payloadFormat").unwrap_or("packed") != "packed" {
        return Err(bad("Ciphertext format must be packed or separate"));
    }
    validate_symmetric_key(&key, algorithm, mode)?;
    let input = str_param(&params, "text")?;
    if action == "encrypt" {
        ensure_input_size(input, "Crypto input", MAX_CRYPTO_INPUT_BYTES)?;
    } else {
        ensure_input_size(
            input,
            "Crypto input",
            encoded_input_limit(MAX_CRYPTO_INPUT_BYTES + 32, "base64"),
        )?;
    }
    if action == "encrypt" {
        let plaintext = input.as_bytes();
        let packed = match (algorithm, mode) {
            ("aes-128", "gcm") | ("aes", "gcm") if key.len() == 16 => {
                aes128_gcm_encrypt(&key, plaintext)?
            }
            ("aes-192", "gcm") | ("aes", "gcm") if key.len() == 24 => {
                aes192_gcm_encrypt(&key, plaintext)?
            }
            ("aes-256", "gcm") | ("aes", "gcm") if key.len() == 32 => {
                aes256_gcm_encrypt(&key, plaintext)?
            }
            ("aes-128", "cbc") | ("aes", "cbc") if key.len() == 16 => {
                cbc_encrypt_aes128(&key, plaintext)?
            }
            ("aes-192", "cbc") | ("aes", "cbc") if key.len() == 24 => {
                cbc_encrypt_aes192(&key, plaintext)?
            }
            ("aes-256", "cbc") | ("aes", "cbc") if key.len() == 32 => {
                cbc_encrypt_aes256(&key, plaintext)?
            }
            ("aes-128" | "aes-192" | "aes-256", "cfb" | "ofb" | "ctr") => {
                aes_stream_packed(&key, plaintext, mode, true)?
            }
            ("aes-128", "ecb") if key.len() == 16 => aes_ecb_encrypt(&key, plaintext, 128)?,
            ("aes-192", "ecb") if key.len() == 24 => aes_ecb_encrypt(&key, plaintext, 192)?,
            ("aes-256", "ecb") if key.len() == 32 => aes_ecb_encrypt(&key, plaintext, 256)?,
            ("sm4-128" | "sm4", "cbc" | "ecb") => sm4_encrypt(&key, plaintext, mode)?,
            _ => return Err(bad("Unsupported algorithm/mode or key length")),
        };
        Ok(json!({ "ok": true, "text": packed }))
    } else {
        let packed = input;
        let plain = match (algorithm, mode) {
            ("aes-128", "gcm") | ("aes", "gcm") if key.len() == 16 => {
                aes128_gcm_decrypt(&key, packed)?
            }
            ("aes-192", "gcm") | ("aes", "gcm") if key.len() == 24 => {
                aes192_gcm_decrypt(&key, packed)?
            }
            ("aes-256", "gcm") | ("aes", "gcm") if key.len() == 32 => {
                aes256_gcm_decrypt(&key, packed)?
            }
            ("aes-128", "cbc") | ("aes", "cbc") if key.len() == 16 => {
                cbc_decrypt_aes128(&key, packed)?
            }
            ("aes-192", "cbc") | ("aes", "cbc") if key.len() == 24 => {
                cbc_decrypt_aes192(&key, packed)?
            }
            ("aes-256", "cbc") | ("aes", "cbc") if key.len() == 32 => {
                cbc_decrypt_aes256(&key, packed)?
            }
            ("aes-128" | "aes-192" | "aes-256", "cfb" | "ofb" | "ctr") => {
                let data =
                    decode_base64_limited(packed.trim(), "Ciphertext", MAX_PACKED_CRYPTO_BYTES)?;
                if data.len() < 16 {
                    return Err(bad("Ciphertext is too short"));
                }
                aes_stream_transform(&key, &data[16..], mode, false, &data[..16])?
            }
            ("aes-128", "ecb") if key.len() == 16 => aes_ecb_decrypt(&key, packed, 128)?,
            ("aes-192", "ecb") if key.len() == 24 => aes_ecb_decrypt(&key, packed, 192)?,
            ("aes-256", "ecb") if key.len() == 32 => aes_ecb_decrypt(&key, packed, 256)?,
            ("sm4-128" | "sm4", "cbc" | "ecb") => sm4_decrypt(&key, packed, mode)?,
            _ => return Err(bad("Unsupported algorithm/mode or key length")),
        };
        let (text, text_encoding) = match String::from_utf8(plain) {
            Ok(text) => (text, "utf8"),
            Err(error) => (hex::encode(error.into_bytes()), "hex"),
        };
        Ok(json!({ "ok": true, "text": text, "textEncoding": text_encoding }))
    }
}

fn validate_symmetric_key(key: &[u8], algorithm: &str, mode: &str) -> Result<(), PluginError> {
    let valid = match (algorithm, mode) {
        ("aes-128", "gcm" | "cbc" | "ecb" | "cfb" | "ofb" | "ctr") => key.len() == 16,
        ("aes-192", "gcm" | "cbc" | "ecb" | "cfb" | "ofb" | "ctr") => key.len() == 24,
        ("aes-256", "gcm" | "cbc" | "ecb" | "cfb" | "ofb" | "ctr") => key.len() == 32,
        ("aes", "gcm" | "cbc" | "ecb" | "cfb" | "ofb" | "ctr") => matches!(key.len(), 16 | 24 | 32),
        ("sm4" | "sm4-128", "cbc" | "ecb") => key.len() == 16,
        _ => false,
    };
    if valid {
        Ok(())
    } else {
        Err(bad("Unsupported algorithm/mode or key length"))
    }
}

fn decode_crypto_bytes(value: &str, encoding: &str) -> Result<Vec<u8>, PluginError> {
    ensure_input_size(
        value,
        "Crypto input",
        encoded_input_limit(MAX_CRYPTO_INPUT_BYTES, encoding),
    )?;
    let bytes = match encoding {
        "utf8" => value.as_bytes().to_vec(),
        "hex" => hex::decode(value.split_whitespace().collect::<String>())
            .map_err(|_| bad("Invalid Hex data"))?,
        "base64" => B64
            .decode(value.split_whitespace().collect::<String>())
            .map_err(|_| bad("Invalid Base64 data"))?,
        _ => return Err(bad("Encoding must be utf8, hex, or base64")),
    };
    ensure_bytes_size(&bytes, "Crypto input", MAX_CRYPTO_INPUT_BYTES)?;
    Ok(bytes)
}

fn encode_crypto_bytes(value: &[u8], encoding: &str) -> Result<String, PluginError> {
    match encoding {
        "utf8" => String::from_utf8(value.to_vec())
            .map_err(|_| bad("Plaintext is not valid UTF-8; select Hex or Base64 output")),
        "hex" => Ok(hex::encode(value)),
        "base64" => Ok(B64.encode(value)),
        _ => Err(bad("Encoding must be utf8, hex, or base64")),
    }
}

// Advanced mode exchanges raw ciphertext and IV/tag separately. Defaults retain the
// existing packed Base64 API above, including its randomly generated IV/nonce.
fn symmetric_separate(
    key: &[u8],
    algorithm: &str,
    mode: &str,
    action: &str,
    params: &Value,
) -> Result<Value, PluginError> {
    validate_symmetric_key(key, algorithm, mode)?;
    let encrypting = action == "encrypt";
    let cipher_encoding = opt_str(params, "cipherEncoding").unwrap_or("base64");
    let parameter_encoding = opt_str(params, "parameterEncoding").unwrap_or("hex");
    let plain_encoding = opt_str(params, "plainEncoding").unwrap_or("utf8");
    if !["hex", "base64"].contains(&cipher_encoding)
        || !["hex", "base64"].contains(&parameter_encoding)
    {
        return Err(bad("Ciphertext and IV/tag encoding must be hex or base64"));
    }
    let iv_len = match mode {
        "gcm" => 12,
        "cbc" | "cfb" | "ofb" | "ctr" => 16,
        _ => 0,
    };
    let raw_iv = opt_str(params, "iv").unwrap_or("");
    let mut iv = if raw_iv.trim().is_empty() && encrypting {
        let mut random = vec![0u8; iv_len];
        rand::thread_rng().fill_bytes(&mut random);
        random
    } else {
        decode_crypto_bytes(raw_iv, parameter_encoding)?
    };
    if mode == "ecb" {
        iv.clear();
    }
    if iv.len() != iv_len {
        return Err(bad(format!(
            "{} must be {iv_len} bytes",
            if mode == "gcm" { "Nonce" } else { "IV" }
        )));
    }
    let aad = if mode == "gcm" {
        decode_crypto_bytes(
            opt_str(params, "aad").unwrap_or(""),
            opt_str(params, "aadEncoding").unwrap_or("utf8"),
        )?
    } else {
        Vec::new()
    };
    let text = str_param(params, "text")?;
    let mut data = decode_crypto_bytes(
        text,
        if encrypting {
            plain_encoding
        } else {
            cipher_encoding
        },
    )?;
    if !encrypting && mode == "gcm" {
        let tag = decode_crypto_bytes(opt_str(params, "tag").unwrap_or(""), parameter_encoding)?;
        if tag.len() != 16 {
            return Err(bad("GCM tag must be 16 bytes"));
        }
        data.extend_from_slice(&tag);
    }
    let mut result = symmetric_bytes(key, algorithm, mode, encrypting, &iv, &aad, &data)?;
    if encrypting {
        let tag = if mode == "gcm" {
            result.split_off(result.len() - 16)
        } else {
            Vec::new()
        };
        Ok(json!({
            "ok": true,
            "text": encode_crypto_bytes(&result, cipher_encoding)?,
            "iv": encode_crypto_bytes(&iv, parameter_encoding)?,
            "tag": encode_crypto_bytes(&tag, parameter_encoding)?,
            "textEncoding": cipher_encoding,
            "parameterEncoding": parameter_encoding,
        }))
    } else {
        Ok(
            json!({ "ok": true, "text": encode_crypto_bytes(&result, plain_encoding)?, "textEncoding": plain_encoding }),
        )
    }
}

fn symmetric_bytes(
    key: &[u8],
    algorithm: &str,
    mode: &str,
    encrypting: bool,
    iv: &[u8],
    aad: &[u8],
    data: &[u8],
) -> Result<Vec<u8>, PluginError> {
    ensure_bytes_size(data, "Crypto input", MAX_CRYPTO_INPUT_BYTES)?;
    ensure_bytes_size(aad, "Crypto AAD", MAX_CRYPTO_INPUT_BYTES)?;
    if mode == "gcm" {
        let payload = Payload { msg: data, aad };
        let nonce = Nonce::from_slice(iv);
        let result = if key.len() == 16 {
            let cipher = Aes128Gcm::new_from_slice(key).map_err(|_| bad("Invalid AES key"))?;
            if encrypting {
                cipher.encrypt(nonce, payload)
            } else {
                cipher.decrypt(nonce, payload)
            }
        } else if key.len() == 24 {
            let cipher = Aes192Gcm::new_from_slice(key).map_err(|_| bad("Invalid AES key"))?;
            if encrypting {
                cipher.encrypt(nonce, payload)
            } else {
                cipher.decrypt(nonce, payload)
            }
        } else {
            let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| bad("Invalid AES key"))?;
            if encrypting {
                cipher.encrypt(nonce, payload)
            } else {
                cipher.decrypt(nonce, payload)
            }
        };
        return result.map_err(|_| err("AES-GCM authentication or encryption failed"));
    }
    if matches!(mode, "cfb" | "ofb" | "ctr") {
        return aes_stream_transform(key, data, mode, encrypting, iv);
    }
    let sm4 = algorithm.starts_with("sm4");
    if encrypting {
        let encrypted = if mode == "ecb" && sm4 {
            ecb::Encryptor::<sm4::Sm4>::new(key.into()).encrypt_padded_vec_mut::<Pkcs7>(data)
        } else if mode == "ecb" && key.len() == 16 {
            ecb::Encryptor::<Aes128>::new(key.into()).encrypt_padded_vec_mut::<Pkcs7>(data)
        } else if mode == "ecb" && key.len() == 24 {
            ecb::Encryptor::<Aes192>::new(key.into()).encrypt_padded_vec_mut::<Pkcs7>(data)
        } else if mode == "ecb" {
            ecb::Encryptor::<Aes256>::new(key.into()).encrypt_padded_vec_mut::<Pkcs7>(data)
        } else if sm4 {
            Sm4CbcEnc::new(key.into(), iv.into()).encrypt_padded_vec_mut::<Pkcs7>(data)
        } else if key.len() == 16 {
            Aes128CbcEnc::new(key.into(), iv.into()).encrypt_padded_vec_mut::<Pkcs7>(data)
        } else if key.len() == 24 {
            Aes192CbcEnc::new(key.into(), iv.into()).encrypt_padded_vec_mut::<Pkcs7>(data)
        } else {
            Aes256CbcEnc::new(key.into(), iv.into()).encrypt_padded_vec_mut::<Pkcs7>(data)
        };
        Ok(encrypted)
    } else {
        let decrypted = if mode == "ecb" && sm4 {
            ecb::Decryptor::<sm4::Sm4>::new(key.into()).decrypt_padded_vec_mut::<Pkcs7>(data)
        } else if mode == "ecb" && key.len() == 16 {
            ecb::Decryptor::<Aes128>::new(key.into()).decrypt_padded_vec_mut::<Pkcs7>(data)
        } else if mode == "ecb" && key.len() == 24 {
            ecb::Decryptor::<Aes192>::new(key.into()).decrypt_padded_vec_mut::<Pkcs7>(data)
        } else if mode == "ecb" {
            ecb::Decryptor::<Aes256>::new(key.into()).decrypt_padded_vec_mut::<Pkcs7>(data)
        } else if sm4 {
            Sm4CbcDec::new(key.into(), iv.into()).decrypt_padded_vec_mut::<Pkcs7>(data)
        } else if key.len() == 16 {
            Aes128CbcDec::new(key.into(), iv.into()).decrypt_padded_vec_mut::<Pkcs7>(data)
        } else if key.len() == 24 {
            Aes192CbcDec::new(key.into(), iv.into()).decrypt_padded_vec_mut::<Pkcs7>(data)
        } else {
            Aes256CbcDec::new(key.into(), iv.into()).decrypt_padded_vec_mut::<Pkcs7>(data)
        };
        decrypted.map_err(|_| err("Ciphertext or PKCS#7 padding is invalid"))
    }
}

fn aes_stream_packed(
    key: &[u8],
    data: &[u8],
    mode: &str,
    encrypting: bool,
) -> Result<String, PluginError> {
    let mut iv = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut iv);
    let transformed = aes_stream_transform(key, data, mode, encrypting, &iv)?;
    let mut packed = Vec::with_capacity(16 + transformed.len());
    packed.extend_from_slice(&iv);
    packed.extend_from_slice(&transformed);
    Ok(B64.encode(packed))
}

fn aes_stream_transform(
    key: &[u8],
    data: &[u8],
    mode: &str,
    encrypting: bool,
    iv: &[u8],
) -> Result<Vec<u8>, PluginError> {
    if iv.len() != 16 {
        return Err(bad("IV must be 16 bytes"));
    }
    let mut output = data.to_vec();
    match (mode, key.len(), encrypting) {
        ("cfb", 16, true) => cfb_mode::Encryptor::<Aes128>::new_from_slices(key, iv)
            .unwrap()
            .encrypt(&mut output),
        ("cfb", 24, true) => cfb_mode::Encryptor::<Aes192>::new_from_slices(key, iv)
            .unwrap()
            .encrypt(&mut output),
        ("cfb", 32, true) => cfb_mode::Encryptor::<Aes256>::new_from_slices(key, iv)
            .unwrap()
            .encrypt(&mut output),
        ("cfb", 16, false) => cfb_mode::Decryptor::<Aes128>::new_from_slices(key, iv)
            .unwrap()
            .decrypt(&mut output),
        ("cfb", 24, false) => cfb_mode::Decryptor::<Aes192>::new_from_slices(key, iv)
            .unwrap()
            .decrypt(&mut output),
        ("cfb", 32, false) => cfb_mode::Decryptor::<Aes256>::new_from_slices(key, iv)
            .unwrap()
            .decrypt(&mut output),
        ("ofb", 16, _) => Aes128Ofb::new_from_slices(key, iv)
            .unwrap()
            .apply_keystream(&mut output),
        ("ofb", 24, _) => Aes192Ofb::new_from_slices(key, iv)
            .unwrap()
            .apply_keystream(&mut output),
        ("ofb", 32, _) => Aes256Ofb::new_from_slices(key, iv)
            .unwrap()
            .apply_keystream(&mut output),
        ("ctr", 16, _) => Aes128Ctr::new_from_slices(key, iv)
            .unwrap()
            .apply_keystream(&mut output),
        ("ctr", 24, _) => Aes192Ctr::new_from_slices(key, iv)
            .unwrap()
            .apply_keystream(&mut output),
        ("ctr", 32, _) => Aes256Ctr::new_from_slices(key, iv)
            .unwrap()
            .apply_keystream(&mut output),
        _ => return Err(bad("Unsupported AES stream mode or key length")),
    }
    Ok(output)
}

fn modern_cipher_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let algorithm = str_param(&params, "algorithm")?.to_ascii_lowercase();
    let op = str_param(&params, "op")?;
    let encrypting = match op {
        "encrypt" => true,
        "decrypt" => false,
        _ => return Err(bad("op must be encrypt or decrypt")),
    };
    let key = resolve_key(vault, &params, &algorithm)?;
    let text = str_param(&params, "text")?;
    let input_encoding =
        opt_str(&params, "inputEncoding").unwrap_or(if encrypting { "utf8" } else { "base64" });
    let output_encoding =
        opt_str(&params, "outputEncoding").unwrap_or(if encrypting { "base64" } else { "utf8" });
    let aad = decode_crypto_bytes(
        opt_str(&params, "aad").unwrap_or(""),
        opt_str(&params, "aadEncoding").unwrap_or("utf8"),
    )?;
    let data = decode_crypto_bytes(text, input_encoding)?;
    let (nonce_len, authenticated) = match algorithm.as_str() {
        "chacha20-poly1305" | "aes-256-gcm-siv" => (12, true),
        "xchacha20-poly1305" => (24, true),
        "aes-256-ccm" => (13, true),
        "aes-256-ctr" => (16, false),
        "aes-256-siv" => (16, true),
        _ => return Err(bad("Unsupported modern cipher algorithm")),
    };
    let expected_key_len = if algorithm == "aes-256-siv" { 64 } else { 32 };
    if key.len() != expected_key_len {
        return Err(bad(format!(
            "Selected algorithm requires a {expected_key_len}-byte key"
        )));
    }
    let raw_nonce = opt_str(&params, "nonce").unwrap_or("");
    let nonce_encoding = opt_str(&params, "nonceEncoding").unwrap_or("hex");
    let nonce = if encrypting && raw_nonce.trim().is_empty() {
        let mut value = vec![0u8; nonce_len];
        rand::thread_rng().fill_bytes(&mut value);
        value
    } else {
        decode_crypto_bytes(raw_nonce, nonce_encoding)?
    };
    if nonce.len() != nonce_len {
        return Err(bad(format!("Nonce must be {nonce_len} bytes")));
    }
    let payload = Payload {
        msg: &data,
        aad: &aad,
    };
    let result = match algorithm.as_str() {
        "chacha20-poly1305" => {
            let cipher = ChaCha20Poly1305::new_from_slice(&key).map_err(|_| bad("Invalid key"))?;
            if encrypting {
                cipher.encrypt(chacha20poly1305::Nonce::from_slice(&nonce), payload)
            } else {
                cipher.decrypt(chacha20poly1305::Nonce::from_slice(&nonce), payload)
            }
            .map_err(|_| err("ChaCha20-Poly1305 authentication failed"))?
        }
        "xchacha20-poly1305" => {
            let cipher = XChaCha20Poly1305::new_from_slice(&key).map_err(|_| bad("Invalid key"))?;
            if encrypting {
                cipher.encrypt(chacha20poly1305::XNonce::from_slice(&nonce), payload)
            } else {
                cipher.decrypt(chacha20poly1305::XNonce::from_slice(&nonce), payload)
            }
            .map_err(|_| err("XChaCha20-Poly1305 authentication failed"))?
        }
        "aes-256-gcm-siv" => {
            let cipher = Aes256GcmSiv::new_from_slice(&key).map_err(|_| bad("Invalid key"))?;
            if encrypting {
                cipher.encrypt(GcmSivNonce::from_slice(&nonce), payload)
            } else {
                cipher.decrypt(GcmSivNonce::from_slice(&nonce), payload)
            }
            .map_err(|_| err("AES-GCM-SIV authentication failed"))?
        }
        "aes-256-ccm" => {
            let cipher = Aes256Ccm::new_from_slice(&key).map_err(|_| bad("Invalid key"))?;
            if encrypting {
                cipher.encrypt(ccm::Nonce::<U13>::from_slice(&nonce), payload)
            } else {
                cipher.decrypt(ccm::Nonce::<U13>::from_slice(&nonce), payload)
            }
            .map_err(|_| err("AES-CCM authentication failed"))?
        }
        "aes-256-ctr" => {
            if !aad.is_empty() {
                return Err(bad("AES-CTR does not support AAD"));
            }
            let mut output = data;
            Aes256Ctr::new_from_slices(&key, &nonce)
                .map_err(|_| bad("Invalid key or counter"))?
                .apply_keystream(&mut output);
            output
        }
        "aes-256-siv" => {
            let cipher = Aes256SivAead::new_from_slice(&key).map_err(|_| bad("Invalid key"))?;
            if encrypting {
                cipher.encrypt(SivNonce::from_slice(&nonce), payload)
            } else {
                cipher.decrypt(SivNonce::from_slice(&nonce), payload)
            }
            .map_err(|_| err("AES-SIV authentication failed"))?
        }
        _ => unreachable!(),
    };
    Ok(json!({
        "ok": true, "text": encode_crypto_bytes(&result, output_encoding)?,
        "nonce": encode_crypto_bytes(&nonce, nonce_encoding)?, "authenticated": authenticated,
        "algorithm": algorithm, "textEncoding": output_encoding
    }))
}

fn specialized_crypto_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let algorithm = str_param(&params, "algorithm")?.to_ascii_lowercase();
    let op = opt_str(&params, "op").unwrap_or("encrypt");
    let key = resolve_key(vault, &params, &algorithm)?;
    let input_encoding = opt_str(&params, "inputEncoding").unwrap_or("hex");
    let output_encoding = opt_str(&params, "outputEncoding").unwrap_or("hex");
    let text = str_param(&params, "text")?;

    if matches!(algorithm.as_str(), "aes-kw" | "aes-kwp") {
        let data = decode_crypto_bytes(text, input_encoding)?;
        let wrapped =
            match (algorithm.as_str(), op, key.len()) {
                ("aes-kw", "encrypt" | "wrap", 16) => {
                    KekAes128::try_from(key.as_slice()).and_then(|k| k.wrap_vec(&data))
                }
                ("aes-kw", "encrypt" | "wrap", 24) => {
                    KekAes192::try_from(key.as_slice()).and_then(|k| k.wrap_vec(&data))
                }
                ("aes-kw", "encrypt" | "wrap", 32) => {
                    KekAes256::try_from(key.as_slice()).and_then(|k| k.wrap_vec(&data))
                }
                ("aes-kw", "decrypt" | "unwrap", 16) => {
                    KekAes128::try_from(key.as_slice()).and_then(|k| k.unwrap_vec(&data))
                }
                ("aes-kw", "decrypt" | "unwrap", 24) => {
                    KekAes192::try_from(key.as_slice()).and_then(|k| k.unwrap_vec(&data))
                }
                ("aes-kw", "decrypt" | "unwrap", 32) => {
                    KekAes256::try_from(key.as_slice()).and_then(|k| k.unwrap_vec(&data))
                }
                ("aes-kwp", "encrypt" | "wrap", 16) => {
                    KekAes128::try_from(key.as_slice()).and_then(|k| k.wrap_with_padding_vec(&data))
                }
                ("aes-kwp", "encrypt" | "wrap", 24) => {
                    KekAes192::try_from(key.as_slice()).and_then(|k| k.wrap_with_padding_vec(&data))
                }
                ("aes-kwp", "encrypt" | "wrap", 32) => {
                    KekAes256::try_from(key.as_slice()).and_then(|k| k.wrap_with_padding_vec(&data))
                }
                ("aes-kwp", "decrypt" | "unwrap", 16) => KekAes128::try_from(key.as_slice())
                    .and_then(|k| k.unwrap_with_padding_vec(&data)),
                ("aes-kwp", "decrypt" | "unwrap", 24) => KekAes192::try_from(key.as_slice())
                    .and_then(|k| k.unwrap_with_padding_vec(&data)),
                ("aes-kwp", "decrypt" | "unwrap", 32) => KekAes256::try_from(key.as_slice())
                    .and_then(|k| k.unwrap_with_padding_vec(&data)),
                _ => {
                    return Err(bad(
                        "AES-KW/KWP requires a 16, 24, or 32-byte KEK and a wrap/unwrap operation",
                    ))
                }
            }
            .map_err(|_| err("AES key wrap integrity or input-length check failed"))?;
        return Ok(
            json!({ "ok": true, "text": encode_crypto_bytes(&wrapped, output_encoding)?, "algorithm": algorithm }),
        );
    }

    if algorithm == "aes-xts" {
        let mut data = decode_crypto_bytes(text, input_encoding)?;
        if data.len() < 16 {
            return Err(bad("AES-XTS input must be at least 16 bytes"));
        }
        let sector = u32_param(&params, "sector", 0) as u128;
        let tweak = get_tweak_default(sector);
        match key.len() {
            32 => {
                let first =
                    Aes128::new_from_slice(&key[..16]).map_err(|_| bad("Invalid AES-XTS key"))?;
                let second =
                    Aes128::new_from_slice(&key[16..]).map_err(|_| bad("Invalid AES-XTS key"))?;
                let xts = Xts128::new(first, second);
                if op == "encrypt" {
                    xts.encrypt_sector(&mut data, tweak);
                } else if op == "decrypt" {
                    xts.decrypt_sector(&mut data, tweak);
                } else {
                    return Err(bad("op must be encrypt or decrypt"));
                }
            }
            64 => {
                let first =
                    Aes256::new_from_slice(&key[..32]).map_err(|_| bad("Invalid AES-XTS key"))?;
                let second =
                    Aes256::new_from_slice(&key[32..]).map_err(|_| bad("Invalid AES-XTS key"))?;
                let xts = Xts128::new(first, second);
                if op == "encrypt" {
                    xts.encrypt_sector(&mut data, tweak);
                } else if op == "decrypt" {
                    xts.decrypt_sector(&mut data, tweak);
                } else {
                    return Err(bad("op must be encrypt or decrypt"));
                }
            }
            _ => {
                return Err(bad(
                    "AES-XTS requires a 32-byte (AES-128-XTS) or 64-byte (AES-256-XTS) key",
                ))
            }
        }
        return Ok(
            json!({ "ok": true, "text": encode_crypto_bytes(&data, output_encoding)?, "algorithm": algorithm, "sector": sector }),
        );
    }

    if algorithm == "aes-ff1" {
        let radix = u32_param(&params, "radix", 10);
        if !matches!(radix, 10 | 36) {
            return Err(bad("This FF1 tool supports radix 10 or 36"));
        }
        let normalized = text.trim().to_ascii_lowercase();
        let numerals: Vec<u16> = normalized
            .chars()
            .map(|ch| {
                ch.to_digit(radix)
                    .map(|v| v as u16)
                    .ok_or_else(|| bad("Input contains a character outside the selected radix"))
            })
            .collect::<Result<_, _>>()?;
        let tweak = decode_crypto_bytes(
            opt_str(&params, "tweak").unwrap_or(""),
            opt_str(&params, "tweakEncoding").unwrap_or("hex"),
        )?;
        let source = FlexibleNumeralString::from(numerals);
        let result = match key.len() {
            16 => ff1_transform::<Aes128>(&key, radix, &tweak, source, op)?,
            24 => ff1_transform::<Aes192>(&key, radix, &tweak, source, op)?,
            32 => ff1_transform::<Aes256>(&key, radix, &tweak, source, op)?,
            _ => return Err(bad("AES-FF1 requires a 16, 24, or 32-byte key")),
        };
        let text: String = result
            .into_iter()
            .map(|digit| char::from_digit(digit as u32, radix).unwrap())
            .collect();
        return Ok(json!({ "ok": true, "text": text, "algorithm": algorithm, "radix": radix }));
    }

    if matches!(
        algorithm.as_str(),
        "aes-cmac" | "aes-128-gmac" | "aes-256-gmac"
    ) {
        let data = decode_crypto_bytes(text, input_encoding)?;
        let tag = if algorithm == "aes-cmac" {
            match key.len() {
                16 => cmac_tag_aes128(&key, &data)?,
                24 => cmac_tag_aes192(&key, &data)?,
                32 => cmac_tag_aes256(&key, &data)?,
                _ => return Err(bad("AES-CMAC requires a 16, 24, or 32-byte key")),
            }
        } else {
            let nonce = decode_crypto_bytes(
                str_param(&params, "nonce")?,
                opt_str(&params, "nonceEncoding").unwrap_or("hex"),
            )?;
            if nonce.len() != 12 {
                return Err(bad("GMAC nonce must be 12 bytes"));
            }
            let payload = Payload {
                msg: &[],
                aad: &data,
            };
            match algorithm.as_str() {
                "aes-128-gmac" if key.len() == 16 => Aes128Gcm::new_from_slice(&key)
                    .unwrap()
                    .encrypt(Nonce::from_slice(&nonce), payload),
                "aes-256-gmac" if key.len() == 32 => Aes256Gcm::new_from_slice(&key)
                    .unwrap()
                    .encrypt(Nonce::from_slice(&nonce), payload),
                _ => {
                    return Err(bad(
                        "AES-GMAC key length does not match the selected algorithm",
                    ))
                }
            }
            .map_err(|_| err("AES-GMAC failed"))?
        };
        return Ok(
            json!({ "ok": true, "text": encode_crypto_bytes(&tag, output_encoding)?, "algorithm": algorithm }),
        );
    }

    Err(bad("Unsupported specialized crypto algorithm"))
}

fn kem_op(vault: &Vault, mut params: Value) -> Result<Value, PluginError> {
    let algorithm = str_param(&params, "algorithm")?.to_ascii_lowercase();
    let op = str_param(&params, "op")?.to_string();
    let stored = opt_str(&params, "keyId")
        .filter(|id| !id.is_empty())
        .map(|id| {
            vault.material_for(
                id,
                if algorithm.starts_with("hpke") {
                    "hpke"
                } else {
                    "ml-kem"
                },
            )
        })
        .transpose()?;
    if let Some(key) = stored {
        let expected = if algorithm.starts_with("hpke") {
            "hpke-x25519"
        } else {
            algorithm.as_str()
        };
        if key.algorithm != expected {
            return Err(bad(
                "Stored key type does not match the selected KEM algorithm",
            ));
        }
        params["privateKey"] = json!(key.material);
        params["publicKey"] = json!(key.public_material);
    }
    match algorithm.as_str() {
        "hpke-x25519-chacha20" => hpke_x25519_op(&op, &params),
        "ml-kem-768" => ml_kem_op::<hpke::kem::MlKem768>(&op, &params),
        "ml-kem-1024" => ml_kem_op::<hpke::kem::MlKem1024>(&op, &params),
        _ => Err(bad("Unsupported KEM algorithm")),
    }
}

fn hpke_x25519_op(op: &str, params: &Value) -> Result<Value, PluginError> {
    type Kem = hpke::kem::X25519HkdfSha256;
    type Kdf = hpke::kdf::HkdfSha256;
    type Aead = hpke::aead::ChaCha20Poly1305;
    match op {
        "generate" => {
            let (private, public) = Kem::gen_keypair();
            Ok(
                json!({ "ok": true, "privateKey": B64.encode(private.to_bytes()), "publicKey": B64.encode(public.to_bytes()) }),
            )
        }
        "encrypt" => {
            let public = hpke_public_key::<Kem>(str_param(params, "publicKey")?)?;
            let input = decode_crypto_bytes(
                str_param(params, "text")?,
                opt_str(params, "inputEncoding").unwrap_or("utf8"),
            )?;
            let info = opt_str(params, "info").unwrap_or("").as_bytes();
            let aad = opt_str(params, "aad").unwrap_or("").as_bytes();
            let (encapped, ciphertext) = hpke::single_shot_seal::<Aead, Kdf, Kem>(
                &hpke::OpModeS::Base,
                &public,
                info,
                &input,
                aad,
            )
            .map_err(|_| err("HPKE encryption failed"))?;
            Ok(
                json!({ "ok": true, "text": B64.encode(ciphertext), "encapsulatedKey": B64.encode(encapped.to_bytes()) }),
            )
        }
        "decrypt" => {
            let private = hpke_private_key::<Kem>(str_param(params, "privateKey")?)?;
            let encapped = hpke_encapped_key::<Kem>(str_param(params, "encapsulatedKey")?)?;
            let ciphertext = decode_base64_limited(
                str_param(params, "text")?,
                "HPKE ciphertext",
                MAX_CRYPTO_INPUT_BYTES,
            )?;
            let info = opt_str(params, "info").unwrap_or("").as_bytes();
            let aad = opt_str(params, "aad").unwrap_or("").as_bytes();
            let plaintext = hpke::single_shot_open::<Aead, Kdf, Kem>(
                &hpke::OpModeR::Base,
                &private,
                &encapped,
                info,
                &ciphertext,
                aad,
            )
            .map_err(|_| err("HPKE authentication or decryption failed"))?;
            Ok(
                json!({ "ok": true, "text": encode_crypto_bytes(&plaintext, opt_str(params, "outputEncoding").unwrap_or("utf8"))? }),
            )
        }
        _ => Err(bad("HPKE operation must be generate, encrypt, or decrypt")),
    }
}

fn ml_kem_op<Kem: HpkeKem>(op: &str, params: &Value) -> Result<Value, PluginError> {
    match op {
        "generate" => {
            let (private, public) = Kem::gen_keypair();
            Ok(
                json!({ "ok": true, "privateKey": B64.encode(private.to_bytes()), "publicKey": B64.encode(public.to_bytes()) }),
            )
        }
        "encapsulate" => {
            let public = hpke_public_key::<Kem>(str_param(params, "publicKey")?)?;
            let (secret, encapped) =
                Kem::encap(&public, None).map_err(|_| err("ML-KEM encapsulation failed"))?;
            Ok(
                json!({ "ok": true, "sharedSecret": B64.encode(secret.0.as_slice()), "encapsulatedKey": B64.encode(encapped.to_bytes()) }),
            )
        }
        "decapsulate" => {
            let private = hpke_private_key::<Kem>(str_param(params, "privateKey")?)?;
            let encapped = hpke_encapped_key::<Kem>(str_param(params, "encapsulatedKey")?)?;
            let secret = Kem::decap(&private, None, &encapped)
                .map_err(|_| err("ML-KEM decapsulation failed"))?;
            Ok(json!({ "ok": true, "sharedSecret": B64.encode(secret.0.as_slice()) }))
        }
        _ => Err(bad(
            "ML-KEM operation must be generate, encapsulate, or decapsulate",
        )),
    }
}

fn hpke_public_key<Kem: HpkeKem>(encoded: &str) -> Result<Kem::PublicKey, PluginError> {
    let bytes = decode_base64_limited(encoded, "KEM public key", MAX_KEY_INPUT_BYTES)?;
    Kem::PublicKey::from_bytes(&bytes).map_err(|_| bad("Invalid KEM public key"))
}

fn hpke_private_key<Kem: HpkeKem>(encoded: &str) -> Result<Kem::PrivateKey, PluginError> {
    let bytes = decode_base64_limited(encoded, "KEM private key", MAX_KEY_INPUT_BYTES)?;
    Kem::PrivateKey::from_bytes(&bytes).map_err(|_| bad("Invalid KEM private key"))
}

fn hpke_encapped_key<Kem: HpkeKem>(encoded: &str) -> Result<Kem::EncappedKey, PluginError> {
    let bytes = decode_base64_limited(encoded, "Encapsulated key", MAX_KEY_INPUT_BYTES)?;
    Kem::EncappedKey::from_bytes(&bytes).map_err(|_| bad("Invalid encapsulated key"))
}

fn ff1_transform<C>(
    key: &[u8],
    radix: u32,
    tweak: &[u8],
    source: FlexibleNumeralString,
    op: &str,
) -> Result<Vec<u16>, PluginError>
where
    C: cipher::BlockCipher + cipher::BlockEncrypt + cipher::KeyInit + Clone,
{
    let ff = FF1::<C>::new(key, radix).map_err(|_| bad("Invalid FF1 key or radix"))?;
    let result = if op == "encrypt" {
        ff.encrypt(tweak, &source)
    } else if op == "decrypt" {
        ff.decrypt(tweak, &source)
    } else {
        return Err(bad("op must be encrypt or decrypt"));
    };
    result.map(Vec::from).map_err(|e| bad(e.to_string()))
}

fn cmac_tag_aes128(key: &[u8], data: &[u8]) -> Result<Vec<u8>, PluginError> {
    cmac_tag_inner::<Cmac<Aes128>>(key, data)
}

fn cmac_tag_aes192(key: &[u8], data: &[u8]) -> Result<Vec<u8>, PluginError> {
    cmac_tag_inner::<Cmac<Aes192>>(key, data)
}

fn cmac_tag_aes256(key: &[u8], data: &[u8]) -> Result<Vec<u8>, PluginError> {
    cmac_tag_inner::<Cmac<Aes256>>(key, data)
}

fn cmac_tag_inner<M: HmacMac + HmacKeyInit>(
    key: &[u8],
    data: &[u8],
) -> Result<Vec<u8>, PluginError> {
    let mut mac = <M as HmacMac>::new_from_slice(key).map_err(|_| bad("Invalid AES-CMAC key"))?;
    HmacMac::update(&mut mac, data);
    Ok(mac.finalize().into_bytes().to_vec())
}

fn kdf_op(params: Value) -> Result<Value, PluginError> {
    let algorithm = str_param(&params, "algorithm")?.to_ascii_lowercase();
    let password = str_param(&params, "text")?;
    ensure_input_size(password, "KDF input", MAX_KEY_INPUT_BYTES)?;
    let salt = decode_crypto_bytes(
        str_param(&params, "salt")?,
        opt_str(&params, "saltEncoding").unwrap_or("hex"),
    )?;
    if salt.len() < 8 {
        return Err(bad("KDF salt must be at least 8 bytes"));
    }
    let length = u32_param(&params, "length", 32).clamp(16, 1024) as usize;
    let mut output = Zeroizing::new(vec![0u8; length]);
    match algorithm.as_str() {
        "pbkdf2-sha256" => {
            let iterations = u32_param(&params, "iterations", 600_000).clamp(10_000, 10_000_000);
            pbkdf2_hmac::<Sha256>(password.as_bytes(), &salt, iterations, output.as_mut());
        }
        "scrypt" => {
            let log_n = u32_param(&params, "logN", 15).clamp(10, 20) as u8;
            let r = u32_param(&params, "r", 8).clamp(1, 32);
            let p = u32_param(&params, "p", 1).clamp(1, 16);
            let config = ScryptParams::new(log_n, r, p, length)
                .map_err(|_| bad("Invalid scrypt parameters"))?;
            scrypt(password.as_bytes(), &salt, &config, output.as_mut())
                .map_err(|_| err("scrypt failed"))?;
        }
        "argon2id" => {
            let memory = u32_param(&params, "memoryKiB", 19_456).clamp(8 * 1024, 256 * 1024);
            let iterations = u32_param(&params, "iterations", 2).clamp(1, 10);
            let parallelism = u32_param(&params, "parallelism", 1).clamp(1, 8);
            let config = argon2::Params::new(memory, iterations, parallelism, Some(length))
                .map_err(|_| bad("Invalid Argon2id parameters"))?;
            argon2::Argon2::new(argon2::Algorithm::Argon2id, argon2::Version::V0x13, config)
                .hash_password_into(password.as_bytes(), &salt, output.as_mut())
                .map_err(|_| err("Argon2id failed"))?;
        }
        "hkdf-sha256" => {
            let info = opt_str(&params, "info").unwrap_or("").as_bytes();
            Hkdf::<Sha256>::new(Some(&salt), password.as_bytes())
                .expand(info, output.as_mut())
                .map_err(|_| bad("HKDF output length is too large"))?;
        }
        _ => return Err(bad("Unsupported KDF algorithm")),
    }
    Ok(
        json!({ "ok": true, "text": hex::encode(output.as_slice()), "algorithm": algorithm, "bytes": length }),
    )
}

fn signature_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let algorithm = str_param(&params, "algorithm")?.to_ascii_lowercase();
    let op = str_param(&params, "op")?;
    let message = str_param(&params, "text")?.as_bytes();
    ensure_bytes_size(message, "Signature input", MAX_CRYPTO_INPUT_BYTES)?;
    match (algorithm.as_str(), op) {
        ("rsa-pss-sha256" | "rsa-pkcs1-sha256", "sign") => {
            let private = decode_rsa_private(&resolve_text_key(vault, &params)?)?;
            let jwt_algorithm = if algorithm.starts_with("rsa-pss") {
                "PS256"
            } else {
                "RS256"
            };
            Ok(
                json!({ "ok": true, "text": B64.encode(jwt_rsa_sign(jwt_algorithm, &private, message)?) }),
            )
        }
        ("rsa-pss-sha256" | "rsa-pkcs1-sha256", "verify") => {
            let public = decode_rsa_public(&resolve_text_key(vault, &params)?)?;
            let signature = decode_base64_limited(
                str_param(&params, "signature")?,
                "Signature",
                MAX_KEY_INPUT_BYTES,
            )?;
            let jwt_algorithm = if algorithm.starts_with("rsa-pss") {
                "PS256"
            } else {
                "RS256"
            };
            Ok(
                json!({ "ok": true, "valid": jwt_rsa_verify(jwt_algorithm, &public, message, &signature)? }),
            )
        }
        ("sm2-sm3", "sign") => {
            let key = resolve_text_key(vault, &params)?;
            let private = sm2_private_key(&key)?;
            let signature =
                std::panic::catch_unwind(|| smcrypto::sm2::Sign::new(private).sign(message))
                    .map_err(|_| bad("SM2 signing failed"))?;
            Ok(json!({ "ok": true, "text": B64.encode(signature) }))
        }
        ("sm2-sm3", "verify") => {
            let key = resolve_text_key(vault, &params)?;
            let public = sm2_public_key(&key)?;
            let signature = decode_base64_limited(
                str_param(&params, "signature")?,
                "Signature",
                MAX_KEY_INPUT_BYTES,
            )?;
            let valid = std::panic::catch_unwind(|| {
                smcrypto::sm2::Verify::new(&public).verify(message, &signature)
            })
            .unwrap_or(false);
            Ok(json!({ "ok": true, "valid": valid }))
        }
        _ => Err(bad("Unsupported signature algorithm or operation")),
    }
}

fn hmac_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let algorithm = opt_str(&params, "algorithm")
        .unwrap_or("hmac-sha256")
        .to_ascii_lowercase();
    if !matches!(
        algorithm.as_str(),
        "hmac" | "hmac-sha1" | "hmac-sha256" | "hmac-sha384" | "hmac-sha512" | "hmac-sm3" | "sm3"
    ) {
        return Err(bad("Unsupported HMAC algorithm"));
    }
    let key = resolve_key(vault, &params, &algorithm)?;
    let text = str_param(&params, "text")?;
    ensure_input_size(text, "Crypto input", MAX_CRYPTO_INPUT_BYTES)?;
    let text = text.as_bytes();
    let digest = match algorithm.as_str() {
        "hmac-sha1" => hmac_hex::<HmacSha1>(&key, text)?,
        "hmac-sha384" => hmac_hex::<HmacSha384>(&key, text)?,
        "hmac-sha512" => hmac_hex::<HmacSha512>(&key, text)?,
        "hmac-sm3" | "sm3" => hmac_hex::<HmacSm3>(&key, text)?,
        _ => hmac_hex::<HmacSha256>(&key, text)?,
    };
    Ok(json!({ "ok": true, "digest": digest }))
}

fn hmac_hex<M: HmacMac + HmacKeyInit>(key: &[u8], text: &[u8]) -> Result<String, PluginError> {
    let mut mac = <M as HmacMac>::new_from_slice(key).map_err(|_| bad("Invalid HMAC key"))?;
    mac.update(text);
    Ok(hex::encode(mac.finalize().into_bytes()))
}

fn xor_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let key = resolve_key(vault, &params, "xor")?;
    if key.is_empty() {
        return Err(bad("XOR key is required"));
    }
    let text = str_param(&params, "text")?;
    ensure_input_size(text, "Crypto input", MAX_CRYPTO_INPUT_BYTES)?;
    let decode_input = bool_param(&params, "inputHex", false);
    let source = if decode_input {
        hex::decode(text.trim()).map_err(|_| bad("Input is not hex"))?
    } else {
        text.as_bytes().to_vec()
    };
    let out: Vec<u8> = source
        .iter()
        .enumerate()
        .map(|(i, b)| b ^ key[i % key.len()])
        .collect();
    Ok(json!({ "ok": true, "text": hex::encode(&out), "utf8": String::from_utf8_lossy(&out) }))
}

fn rsa_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let op = str_param(&params, "op")?;
    let pem = resolve_text_key(vault, &params)?;
    let text = str_param(&params, "text")?;
    let padding = rsa_padding(&params)?;
    let oaep_hash = rsa_oaep_hash(&params, padding)?;
    let plain_encoding = opt_str(&params, "plainEncoding").unwrap_or("utf8");
    let cipher_encoding = opt_str(&params, "cipherEncoding").unwrap_or("base64");
    match op {
        "encrypt" => {
            ensure_input_size(text, "RSA input", MAX_CRYPTO_INPUT_BYTES)?;
            let public = decode_rsa_public(&pem)?;
            let plaintext = decode_crypto_bytes(text, plain_encoding)?;
            let mut rng = rand::thread_rng();
            let cipher = if padding == "pkcs1" {
                public.encrypt(&mut rng, Pkcs1v15Encrypt, &plaintext)
            } else {
                match oaep_hash {
                    "sha1" => public.encrypt(&mut rng, Oaep::new::<Sha1>(), &plaintext),
                    "sha384" => public.encrypt(&mut rng, Oaep::new::<Sha384>(), &plaintext),
                    "sha512" => public.encrypt(&mut rng, Oaep::new::<Sha512>(), &plaintext),
                    _ => public.encrypt(&mut rng, Oaep::new::<Sha256>(), &plaintext),
                }
            }
            .map_err(rsa_crypto_error)?;
            Ok(json!({
                "ok": true,
                "text": encode_crypto_bytes(&cipher, cipher_encoding)?,
                "padding": padding,
                "oaepHash": oaep_hash,
                "textEncoding": cipher_encoding,
            }))
        }
        "decrypt" => {
            let private = decode_rsa_private(&pem)?;
            let data = decode_crypto_bytes(text.trim(), cipher_encoding)?;
            let plain = if padding == "pkcs1" {
                private.decrypt(Pkcs1v15Encrypt, &data)
            } else {
                match oaep_hash {
                    "sha1" => private.decrypt(Oaep::new::<Sha1>(), &data),
                    "sha384" => private.decrypt(Oaep::new::<Sha384>(), &data),
                    "sha512" => private.decrypt(Oaep::new::<Sha512>(), &data),
                    _ => private.decrypt(Oaep::new::<Sha256>(), &data),
                }
            }
            .map_err(rsa_crypto_error)?;
            let (text, text_encoding) = encode_asymmetric_output(&plain, &params)?;
            Ok(
                json!({ "ok": true, "text": text, "textEncoding": text_encoding, "padding": padding }),
            )
        }
        _ => Err(bad("op must be encrypt or decrypt")),
    }
}

fn rsa_oaep_hash(params: &Value, padding: &str) -> Result<&'static str, PluginError> {
    if padding == "pkcs1" {
        return Ok("none");
    }
    match opt_str(params, "oaepHash")
        .unwrap_or("sha256")
        .trim()
        .to_ascii_lowercase()
        .replace('-', "")
        .as_str()
    {
        "sha1" => Ok("sha1"),
        "sha256" => Ok("sha256"),
        "sha384" => Ok("sha384"),
        "sha512" => Ok("sha512"),
        _ => Err(bad(
            "RSA OAEP hash must be SHA-1, SHA-256, SHA-384, or SHA-512",
        )),
    }
}

fn rsa_padding(params: &Value) -> Result<&'static str, PluginError> {
    match opt_str(params, "padding")
        .unwrap_or("oaep")
        .trim()
        .to_ascii_lowercase()
        .as_str()
    {
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

fn encode_asymmetric_output(
    bytes: &[u8],
    params: &Value,
) -> Result<(String, &'static str), PluginError> {
    let Some(raw) = opt_str(params, "outputEncoding") else {
        // Preserve the original API: invalid UTF-8 was rendered lossily.
        return Ok((String::from_utf8_lossy(bytes).into_owned(), "utf8"));
    };
    let encoding = raw.trim().to_ascii_lowercase();
    match encoding.as_str() {
        "utf8" | "utf-8" => Ok((
            String::from_utf8(bytes.to_vec())
                .map_err(|_| bad("Plaintext is not valid UTF-8; select Hex or Base64 output"))?,
            "utf8",
        )),
        "hex" => Ok((hex::encode(bytes), "hex")),
        "base64" => Ok((B64.encode(bytes), "base64")),
        _ => Err(bad("Output encoding must be utf8, hex, or base64")),
    }
}

fn sm2_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let op = str_param(&params, "op")?;
    let key = resolve_text_key(vault, &params)?;
    let text = str_param(&params, "text")?;
    match op {
        "encrypt" => {
            ensure_input_size(text, "SM2 input", MAX_CRYPTO_INPUT_BYTES)?;
            let public_key = sm2_public_key(&key)?;
            let cipher = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                smcrypto::sm2::Encrypt::new(&public_key).encrypt_base64(text.as_bytes())
            }))
            .map_err(|_| bad("SM2 encryption failed"))?;
            Ok(json!({ "ok": true, "text": cipher }))
        }
        "decrypt" => {
            let private_key = sm2_private_key(&key)?;
            let ciphertext =
                decode_base64_limited(text.trim(), "SM2 ciphertext", MAX_CRYPTO_INPUT_BYTES)?;
            if ciphertext.len() < 96 {
                return Err(bad("SM2 ciphertext is truncated"));
            }
            if !smcrypto::sm2::pubkey_valid(&hex::encode(&ciphertext[..64])) {
                return Err(bad("SM2 ciphertext contains an invalid curve point"));
            }
            let plain = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
                smcrypto::sm2::Decrypt::new(private_key).decrypt(&ciphertext)
            }))
            .map_err(|_| bad("SM2 decryption failed"))?;
            let (text, text_encoding) = encode_asymmetric_output(&plain, &params)?;
            Ok(json!({ "ok": true, "text": text, "textEncoding": text_encoding }))
        }
        _ => Err(bad("op must be encrypt or decrypt")),
    }
}

fn sm2_private_key(key: &str) -> Result<&str, PluginError> {
    let value = key.trim();
    if !smcrypto::sm2::privkey_valid(value) || value.bytes().all(|byte| byte == b'0') {
        return Err(bad("SM2 decryption requires a 32-byte private key"));
    }
    let valid = std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        let public = smcrypto::sm2::pk_from_sk(value);
        smcrypto::sm2::pubkey_valid(&public)
    }))
    .unwrap_or(false);
    if !valid {
        return Err(bad("Invalid SM2 private key"));
    }
    Ok(value)
}

fn sm2_public_key(key: &str) -> Result<String, PluginError> {
    let value = key.trim();
    if smcrypto::sm2::pubkey_valid(value) {
        return Ok(value.to_string());
    }
    let private = sm2_private_key(value)
        .map_err(|_| bad("SM2 encryption requires a public or private key"))?;
    std::panic::catch_unwind(std::panic::AssertUnwindSafe(|| {
        smcrypto::sm2::pk_from_sk(private)
    }))
    .map_err(|_| bad("Invalid SM2 private key"))
}

fn jwt_sign(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let algorithm = opt_str(&params, "algorithm")
        .unwrap_or("HS256")
        .to_ascii_uppercase();
    let header = serde_json::to_string(&json!({ "alg": algorithm.as_str(), "typ": "JWT" }))
        .map_err(|error| err(error.to_string()))?;
    let payload = str_param(&params, "text")?;
    ensure_input_size(payload, "JWT input", MAX_CRYPTO_INPUT_BYTES)?;
    serde_json::from_str::<Value>(payload).map_err(json_error)?;
    let h = b64url(header.as_bytes());
    let p = b64url(payload.as_bytes());
    let signing = format!("{h}.{p}");
    let signature = match algorithm.as_str() {
        "HS256" | "HS384" | "HS512" => {
            let key = resolve_key(vault, &params, "hmac")?;
            jwt_hmac_sign(algorithm.as_str(), &key, signing.as_bytes())?
        }
        "RS256" | "RS384" | "RS512" | "PS256" | "PS384" | "PS512" => {
            let private = decode_rsa_private(&resolve_text_key(vault, &params)?)?;
            jwt_rsa_sign(algorithm.as_str(), &private, signing.as_bytes())?
        }
        _ => return Err(bad("Unsupported JWT algorithm")),
    };
    let sig = b64url(&signature);
    Ok(json!({ "ok": true, "text": format!("{signing}.{sig}") }))
}

fn jwt_verify(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let token = str_param(&params, "text")?.trim();
    ensure_input_size(token, "JWT input", MAX_CRYPTO_INPUT_BYTES)?;
    let parts: Vec<&str> = token.split('.').collect();
    if parts.len() != 3 || parts.iter().any(|part| part.is_empty()) {
        return Err(bad("JWT must contain three non-empty parts"));
    }
    let header_bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(parts[0])
        .map_err(|_| bad("Invalid JWT header"))?;
    let header: Value =
        serde_json::from_slice(&header_bytes).map_err(|_| bad("Invalid JWT header"))?;
    let algorithm = opt_str(&params, "algorithm")
        .unwrap_or_else(|| header.get("alg").and_then(Value::as_str).unwrap_or(""))
        .to_ascii_uppercase();
    if header.get("alg").and_then(Value::as_str) != Some(algorithm.as_str()) {
        return Err(bad(
            "JWT header algorithm does not match the selected algorithm",
        ));
    }
    let signature = base64::engine::general_purpose::URL_SAFE_NO_PAD
        .decode(parts[2])
        .map_err(|_| bad("Invalid JWT signature"))?;
    let signing = format!("{}.{}", parts[0], parts[1]);
    let valid = match algorithm.as_str() {
        "HS256" | "HS384" | "HS512" => {
            let key = resolve_key(vault, &params, "hmac")?;
            jwt_hmac_verify(algorithm.as_str(), &key, signing.as_bytes(), &signature)?
        }
        "RS256" | "RS384" | "RS512" | "PS256" | "PS384" | "PS512" => {
            let public = decode_rsa_public(&resolve_text_key(vault, &params)?)?;
            jwt_rsa_verify(algorithm.as_str(), &public, signing.as_bytes(), &signature)?
        }
        _ => return Err(bad("Unsupported JWT algorithm")),
    };
    Ok(json!({ "ok": true, "valid": valid }))
}

fn jwt_hmac_sign(algorithm: &str, key: &[u8], message: &[u8]) -> Result<Vec<u8>, PluginError> {
    let signature = match algorithm {
        "HS256" => {
            let mut mac = <HmacSha256 as HmacMac>::new_from_slice(key)
                .map_err(|_| bad("Invalid HMAC key"))?;
            mac.update(message);
            mac.finalize().into_bytes().to_vec()
        }
        "HS384" => {
            let mut mac = <HmacSha384 as HmacMac>::new_from_slice(key)
                .map_err(|_| bad("Invalid HMAC key"))?;
            mac.update(message);
            mac.finalize().into_bytes().to_vec()
        }
        "HS512" => {
            let mut mac = <HmacSha512 as HmacMac>::new_from_slice(key)
                .map_err(|_| bad("Invalid HMAC key"))?;
            mac.update(message);
            mac.finalize().into_bytes().to_vec()
        }
        _ => return Err(bad("Unsupported JWT algorithm")),
    };
    Ok(signature)
}

fn jwt_hmac_verify(
    algorithm: &str,
    key: &[u8],
    message: &[u8],
    signature: &[u8],
) -> Result<bool, PluginError> {
    let valid = match algorithm {
        "HS256" => {
            let mut mac = <HmacSha256 as HmacMac>::new_from_slice(key)
                .map_err(|_| bad("Invalid HMAC key"))?;
            mac.update(message);
            mac.verify_slice(signature).is_ok()
        }
        "HS384" => {
            let mut mac = <HmacSha384 as HmacMac>::new_from_slice(key)
                .map_err(|_| bad("Invalid HMAC key"))?;
            mac.update(message);
            mac.verify_slice(signature).is_ok()
        }
        "HS512" => {
            let mut mac = <HmacSha512 as HmacMac>::new_from_slice(key)
                .map_err(|_| bad("Invalid HMAC key"))?;
            mac.update(message);
            mac.verify_slice(signature).is_ok()
        }
        _ => return Err(bad("Unsupported JWT algorithm")),
    };
    Ok(valid)
}

fn jwt_rsa_sign(
    algorithm: &str,
    private: &RsaPrivateKey,
    message: &[u8],
) -> Result<Vec<u8>, PluginError> {
    let result = match algorithm {
        "RS256" => private.sign(Pkcs1v15Sign::new::<Sha256>(), &Sha256::digest(message)),
        "RS384" => private.sign(Pkcs1v15Sign::new::<Sha384>(), &Sha384::digest(message)),
        "RS512" => private.sign(Pkcs1v15Sign::new::<Sha512>(), &Sha512::digest(message)),
        "PS256" => private.sign_with_rng(
            &mut rand::thread_rng(),
            Pss::new_with_salt::<Sha256>(32),
            &Sha256::digest(message),
        ),
        "PS384" => private.sign_with_rng(
            &mut rand::thread_rng(),
            Pss::new_with_salt::<Sha384>(48),
            &Sha384::digest(message),
        ),
        "PS512" => private.sign_with_rng(
            &mut rand::thread_rng(),
            Pss::new_with_salt::<Sha512>(64),
            &Sha512::digest(message),
        ),
        _ => return Err(bad("Unsupported JWT algorithm")),
    };
    result.map_err(|_| err("JWT signing failed"))
}

fn jwt_rsa_verify(
    algorithm: &str,
    public: &RsaPublicKey,
    message: &[u8],
    signature: &[u8],
) -> Result<bool, PluginError> {
    let result = match algorithm {
        "RS256" => public.verify(
            Pkcs1v15Sign::new::<Sha256>(),
            &Sha256::digest(message),
            signature,
        ),
        "RS384" => public.verify(
            Pkcs1v15Sign::new::<Sha384>(),
            &Sha384::digest(message),
            signature,
        ),
        "RS512" => public.verify(
            Pkcs1v15Sign::new::<Sha512>(),
            &Sha512::digest(message),
            signature,
        ),
        "PS256" => public.verify(
            Pss::new_with_salt::<Sha256>(32),
            &Sha256::digest(message),
            signature,
        ),
        "PS384" => public.verify(
            Pss::new_with_salt::<Sha384>(48),
            &Sha384::digest(message),
            signature,
        ),
        "PS512" => public.verify(
            Pss::new_with_salt::<Sha512>(64),
            &Sha512::digest(message),
            signature,
        ),
        _ => return Err(bad("Unsupported JWT algorithm")),
    };
    Ok(result.is_ok())
}

fn ssh_fingerprint(line: &str) -> Result<Value, PluginError> {
    let parts: Vec<&str> = line.split_whitespace().collect();
    if parts.len() < 2 {
        return Err(bad("OpenSSH public key needs type and base64 body"));
    }
    let key_type = parts[0];
    if !matches!(
        key_type,
        "ssh-rsa"
            | "ssh-ed25519"
            | "ecdsa-sha2-nistp256"
            | "ecdsa-sha2-nistp384"
            | "ecdsa-sha2-nistp521"
    ) {
        return Err(bad("Unsupported OpenSSH public key type"));
    }
    let body = B64
        .decode(parts[1].as_bytes())
        .map_err(|_| bad("Invalid OpenSSH key body"))?;
    let mut cursor = body.as_slice();
    let wire_type = ssh_string(&mut cursor).ok_or_else(|| bad("Truncated OpenSSH key body"))?;
    if wire_type != key_type.as_bytes() {
        return Err(bad("OpenSSH key type does not match its body"));
    }
    match key_type {
        "ssh-rsa" => {
            let exponent =
                ssh_string(&mut cursor).ok_or_else(|| bad("Truncated RSA public key"))?;
            let modulus = ssh_string(&mut cursor).ok_or_else(|| bad("Truncated RSA public key"))?;
            if exponent.is_empty() || modulus.is_empty() || !cursor.is_empty() {
                return Err(bad("Invalid RSA public key body"));
            }
        }
        "ssh-ed25519" => {
            let key = ssh_string(&mut cursor).ok_or_else(|| bad("Truncated Ed25519 public key"))?;
            if key.len() != 32 || !cursor.is_empty() {
                return Err(bad("Invalid Ed25519 public key body"));
            }
        }
        curve_type => {
            let expected_curve = curve_type
                .strip_prefix("ecdsa-sha2-")
                .ok_or_else(|| bad("Invalid ECDSA public key type"))?;
            let curve = ssh_string(&mut cursor).ok_or_else(|| bad("Truncated ECDSA public key"))?;
            let point = ssh_string(&mut cursor).ok_or_else(|| bad("Truncated ECDSA public key"))?;
            if curve != expected_curve.as_bytes()
                || point.len() < 2
                || point[0] != 4
                || !cursor.is_empty()
            {
                return Err(bad("Invalid ECDSA public key body"));
            }
        }
    }
    let sha256 = Sha256::digest(&body);
    let md5 = Md5::digest(&body);
    let md5_colon = md5
        .iter()
        .map(|b| format!("{b:02x}"))
        .collect::<Vec<_>>()
        .join(":");
    Ok(json!({
        "ok": true,
        "kind": "ssh",
        "type": key_type,
        "comment": if parts.len() > 2 { parts[2..].join(" ") } else { String::new() },
        "fingerprintSha256": format!("SHA256:{}", B64.encode(sha256).trim_end_matches('=')),
        "fingerprintMd5": md5_colon,
        "bytes": body.len()
    }))
}

fn ssh_string<'a>(input: &mut &'a [u8]) -> Option<&'a [u8]> {
    if input.len() < 4 {
        return None;
    }
    let length = u32::from_be_bytes([input[0], input[1], input[2], input[3]]) as usize;
    *input = &input[4..];
    if length > input.len() {
        return None;
    }
    let value = &input[..length];
    *input = &input[length..];
    Some(value)
}

fn resolve_key(
    vault: &Vault,
    params: &Value,
    algorithm: &str,
) -> Result<Zeroizing<Vec<u8>>, PluginError> {
    if let Some(id) = opt_str(params, "keyId") {
        if !id.is_empty() {
            let purpose = opt_str(params, "requiredPurpose").unwrap_or("");
            let stored = vault.material_for(id, purpose)?;
            if !stored_key_matches_algorithm(&stored.algorithm, algorithm) {
                return Err(bad("Stored key type does not match the selected algorithm"));
            }
            let material = &stored.material;
            ensure_input_size(material, "Key material", MAX_KEY_INPUT_BYTES)?;
            return decode_key_bytes(material).map(Zeroizing::new);
        }
    }
    let material = opt_str(params, "keyMaterial").unwrap_or("");
    if material.is_empty() {
        return Err(bad("Provide keyId or keyMaterial"));
    }
    ensure_input_size(material, "Key material", MAX_KEY_INPUT_BYTES)?;
    let bytes = match opt_str(params, "keyEncoding").unwrap_or("auto") {
        "auto" if key_length_matches_algorithm(algorithm, material.len()) => {
            match decode_key_bytes(material) {
                Ok(decoded) if key_length_matches_algorithm(algorithm, decoded.len()) => decoded,
                _ => material.as_bytes().to_vec(),
            }
        }
        "auto" => decode_key_bytes(material)?,
        "utf8" => material.as_bytes().to_vec(),
        "hex" => hex::decode(material.split_whitespace().collect::<String>())
            .map_err(|_| bad("Invalid Hex key material"))?,
        "base64" => B64
            .decode(material.split_whitespace().collect::<String>())
            .map_err(|_| bad("Invalid Base64 key material"))?,
        _ => return Err(bad("Key encoding must be auto, utf8, hex, or base64")),
    };
    if bytes.is_empty() {
        return Err(bad("Material is required"));
    }
    Ok(Zeroizing::new(bytes))
}

fn stored_key_matches_algorithm(stored: &str, requested: &str) -> bool {
    match requested {
        "aes-128" | "aes-192" | "aes-256" | "sm4-128" => stored == requested,
        "sm4" => stored == "sm4-128",
        "aes" | "aes-kw" | "aes-kwp" | "aes-ff1" | "aes-cmac" => {
            matches!(stored, "aes-128" | "aes-192" | "aes-256")
        }
        "aes-128-gmac" => stored == "aes-128",
        "aes-256-gmac" | "aes-256-gcm-siv" | "aes-256-ccm" => stored == "aes-256",
        "aes-256-siv" => stored == "aes-siv-512",
        "aes-xts" => matches!(stored, "aes-xts-256" | "aes-xts-512"),
        "chacha20-poly1305" | "xchacha20-poly1305" => stored == "chacha20-256",
        "hmac" | "hmac-sha1" | "hmac-sha256" | "hmac-sha384" | "hmac-sha512" | "hmac-sm3"
        | "sm3" => stored == "hmac" || stored.starts_with("hmac-"),
        // XOR is deliberately purpose-gated rather than coupled to a key type.
        "xor" => true,
        _ => true,
    }
}

fn key_length_matches_algorithm(algorithm: &str, length: usize) -> bool {
    match algorithm {
        "aes-128" | "sm4" | "sm4-128" => length == 16,
        "aes-192" => length == 24,
        "aes-256" => length == 32,
        "aes" => matches!(length, 16 | 24 | 32),
        _ => false,
    }
}

fn resolve_text_key(vault: &Vault, params: &Value) -> Result<Zeroizing<String>, PluginError> {
    if let Some(id) = opt_str(params, "keyId") {
        if !id.is_empty() {
            let purpose = opt_str(params, "requiredPurpose").unwrap_or("");
            let material = &vault.material_for(id, purpose)?.material;
            ensure_input_size(material, "Key material", MAX_KEY_INPUT_BYTES)?;
            return Ok(Zeroizing::new(material.clone()));
        }
    }
    let material = opt_str(params, "keyMaterial").unwrap_or("");
    if material.is_empty() {
        return Err(bad("Provide keyId or keyMaterial"));
    }
    ensure_input_size(material, "Key material", MAX_KEY_INPUT_BYTES)?;
    Ok(Zeroizing::new(material.to_string()))
}

fn aes128_gcm_encrypt(key: &[u8], plaintext: &[u8]) -> Result<String, PluginError> {
    let cipher = Aes128Gcm::new_from_slice(key).map_err(|_| bad("Invalid AES key"))?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let nonce = Nonce::from_slice(&nonce_bytes);
    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| err("AES-GCM encrypt failed"))?;
    let mut packed = Vec::with_capacity(12 + ct.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ct);
    Ok(B64.encode(packed))
}

fn aes192_gcm_encrypt(key: &[u8], plaintext: &[u8]) -> Result<String, PluginError> {
    let cipher = Aes192Gcm::new_from_slice(key).map_err(|_| bad("Invalid AES key"))?;
    let mut nonce_bytes = [0u8; 12];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let ct = cipher
        .encrypt(Nonce::from_slice(&nonce_bytes), plaintext)
        .map_err(|_| err("AES-GCM encrypt failed"))?;
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
    let ct = cipher
        .encrypt(nonce, plaintext)
        .map_err(|_| err("AES-GCM encrypt failed"))?;
    let mut packed = Vec::with_capacity(12 + ct.len());
    packed.extend_from_slice(&nonce_bytes);
    packed.extend_from_slice(&ct);
    Ok(B64.encode(packed))
}

fn aes128_gcm_decrypt(key: &[u8], packed: &str) -> Result<Vec<u8>, PluginError> {
    let data = decode_base64_limited(packed.trim(), "Ciphertext", MAX_PACKED_CRYPTO_BYTES)?;
    if data.len() < 13 {
        return Err(bad("Ciphertext is too short"));
    }
    let cipher = Aes128Gcm::new_from_slice(key).map_err(|_| bad("Invalid AES key"))?;
    let nonce = Nonce::from_slice(&data[..12]);
    cipher
        .decrypt(nonce, &data[12..])
        .map_err(|_| err("AES-GCM decrypt failed"))
}

fn aes192_gcm_decrypt(key: &[u8], packed: &str) -> Result<Vec<u8>, PluginError> {
    let data = decode_base64_limited(packed.trim(), "Ciphertext", MAX_PACKED_CRYPTO_BYTES)?;
    if data.len() < 13 {
        return Err(bad("Ciphertext is too short"));
    }
    let cipher = Aes192Gcm::new_from_slice(key).map_err(|_| bad("Invalid AES key"))?;
    cipher
        .decrypt(Nonce::from_slice(&data[..12]), &data[12..])
        .map_err(|_| err("AES-GCM decrypt failed"))
}

fn aes256_gcm_decrypt(key: &[u8], packed: &str) -> Result<Vec<u8>, PluginError> {
    let data = decode_base64_limited(packed.trim(), "Ciphertext", MAX_PACKED_CRYPTO_BYTES)?;
    if data.len() < 13 {
        return Err(bad("Ciphertext is too short"));
    }
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|_| bad("Invalid AES key"))?;
    let nonce = Nonce::from_slice(&data[..12]);
    cipher
        .decrypt(nonce, &data[12..])
        .map_err(|_| err("AES-GCM decrypt failed"))
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
    let data = decode_base64_limited(packed.trim(), "Ciphertext", MAX_PACKED_CRYPTO_BYTES)?;
    if data.len() < 32 {
        return Err(bad("Ciphertext is too short"));
    }
    let decryptor = Aes128CbcDec::new(key.into(), data[..16].into());
    decryptor
        .decrypt_padded_vec_mut::<Pkcs7>(&data[16..])
        .map_err(|_| err("AES-CBC decrypt failed"))
}

fn cbc_encrypt_aes192(key: &[u8], plaintext: &[u8]) -> Result<String, PluginError> {
    let mut iv = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut iv);
    let ct = Aes192CbcEnc::new(key.into(), &iv.into()).encrypt_padded_vec_mut::<Pkcs7>(plaintext);
    let mut packed = Vec::from(iv);
    packed.extend_from_slice(&ct);
    Ok(B64.encode(packed))
}

fn cbc_decrypt_aes192(key: &[u8], packed: &str) -> Result<Vec<u8>, PluginError> {
    let data = decode_base64_limited(packed.trim(), "Ciphertext", MAX_PACKED_CRYPTO_BYTES)?;
    if data.len() < 32 {
        return Err(bad("Ciphertext is too short"));
    }
    Aes192CbcDec::new(key.into(), data[..16].into())
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
    let data = decode_base64_limited(packed.trim(), "Ciphertext", MAX_PACKED_CRYPTO_BYTES)?;
    if data.len() < 32 {
        return Err(bad("Ciphertext is too short"));
    }
    let decryptor = Aes256CbcDec::new(key.into(), data[..16].into());
    decryptor
        .decrypt_padded_vec_mut::<Pkcs7>(&data[16..])
        .map_err(|_| err("AES-CBC decrypt failed"))
}

fn aes_ecb_encrypt(key: &[u8], plaintext: &[u8], bits: u16) -> Result<String, PluginError> {
    use cipher::KeyInit;
    let ciphertext = match bits {
        128 => ecb::Encryptor::<Aes128>::new(key.into()).encrypt_padded_vec_mut::<Pkcs7>(plaintext),
        192 => ecb::Encryptor::<Aes192>::new(key.into()).encrypt_padded_vec_mut::<Pkcs7>(plaintext),
        256 => ecb::Encryptor::<Aes256>::new(key.into()).encrypt_padded_vec_mut::<Pkcs7>(plaintext),
        _ => return Err(bad("Invalid AES key length")),
    };
    Ok(B64.encode(ciphertext))
}

fn aes_ecb_decrypt(key: &[u8], packed: &str, bits: u16) -> Result<Vec<u8>, PluginError> {
    use cipher::KeyInit;
    let data = decode_base64_limited(packed.trim(), "Ciphertext", MAX_PACKED_CRYPTO_BYTES)?;
    let result = match bits {
        128 => ecb::Decryptor::<Aes128>::new(key.into()).decrypt_padded_vec_mut::<Pkcs7>(&data),
        192 => ecb::Decryptor::<Aes192>::new(key.into()).decrypt_padded_vec_mut::<Pkcs7>(&data),
        256 => ecb::Decryptor::<Aes256>::new(key.into()).decrypt_padded_vec_mut::<Pkcs7>(&data),
        _ => return Err(bad("Invalid AES key length")),
    };
    result.map_err(|_| err("AES-ECB decrypt failed"))
}

fn sm4_encrypt(key: &[u8], plaintext: &[u8], mode: &str) -> Result<String, PluginError> {
    if key.len() != 16 {
        return Err(bad("SM4 key must be 16 bytes"));
    }
    match mode {
        "ecb" => {
            use cipher::KeyInit;
            type Sm4EcbEnc = ecb::Encryptor<sm4::Sm4>;
            let encryptor = Sm4EcbEnc::new(key.into());
            let ct = encryptor.encrypt_padded_vec_mut::<Pkcs7>(plaintext);
            Ok(B64.encode(ct))
        }
        "cbc" => {
            let mut iv = [0u8; 16];
            rand::thread_rng().fill_bytes(&mut iv);
            let encryptor = Sm4CbcEnc::new(key.into(), &iv.into());
            let ct = encryptor.encrypt_padded_vec_mut::<Pkcs7>(plaintext);
            let mut packed = Vec::from(iv);
            packed.extend_from_slice(&ct);
            Ok(B64.encode(packed))
        }
        _ => Err(bad("Unsupported algorithm/mode or key length")),
    }
}

fn sm4_decrypt(key: &[u8], packed: &str, mode: &str) -> Result<Vec<u8>, PluginError> {
    if key.len() != 16 {
        return Err(bad("SM4 key must be 16 bytes"));
    }
    let data = decode_base64_limited(packed.trim(), "Ciphertext", MAX_PACKED_CRYPTO_BYTES)?;
    match mode {
        "ecb" => {
            use cipher::KeyInit;
            type Sm4EcbDec = ecb::Decryptor<sm4::Sm4>;
            let decryptor = Sm4EcbDec::new(key.into());
            decryptor
                .decrypt_padded_vec_mut::<Pkcs7>(&data)
                .map_err(|_| err("SM4-ECB decrypt failed"))
        }
        "cbc" => {
            if data.len() < 32 {
                return Err(bad("Ciphertext is too short"));
            }
            let decryptor = Sm4CbcDec::new(key.into(), data[..16].into());
            decryptor
                .decrypt_padded_vec_mut::<Pkcs7>(&data[16..])
                .map_err(|_| err("SM4-CBC decrypt failed"))
        }
        _ => Err(bad("Unsupported algorithm/mode or key length")),
    }
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
    err(format!(
        "{} (line {}, column {})",
        error,
        error.line(),
        error.column()
    ))
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

#[cfg(test)]
mod crypto_tests {
    use super::*;

    fn request(algorithm: &str, mode: &str) -> Value {
        json!({ "algorithm": algorithm, "mode": mode, "payloadFormat": "separate",
            "keyMaterial": match algorithm { "aes-256" => "00".repeat(32), "aes-192" => "00".repeat(24), _ => "00".repeat(16) },
            "cipherEncoding": "hex", "plainEncoding": "hex", "parameterEncoding": "hex", "text": "" })
    }

    #[test]
    fn separate_gcm_matches_nist_vector() {
        let mut params = request("aes-128", "gcm");
        params["iv"] = json!("00".repeat(12));
        params["text"] = json!("00".repeat(16));
        let encrypted = symmetric(&Vault::default(), "encrypt", params.clone()).unwrap();
        assert_eq!(encrypted["text"], "0388dace60b6a392f328c2b971b2fe78");
        assert_eq!(encrypted["tag"], "ab6e47d42cec13bdf53a67b21257bddf");
        params["text"] = encrypted["text"].clone();
        params["tag"] = encrypted["tag"].clone();
        assert_eq!(
            symmetric(&Vault::default(), "decrypt", params).unwrap()["text"],
            "00".repeat(16)
        );
    }

    #[test]
    fn gcm_authenticates_aad_and_supports_empty_ciphertext() {
        let mut params = request("aes-256", "gcm");
        params["aad"] = json!("context");
        let encrypted = symmetric(&Vault::default(), "encrypt", params.clone()).unwrap();
        assert_eq!(encrypted["text"], "");
        params["iv"] = encrypted["iv"].clone();
        params["tag"] = encrypted["tag"].clone();
        assert_eq!(
            symmetric(&Vault::default(), "decrypt", params.clone()).unwrap()["text"],
            ""
        );
        params["aad"] = json!("different context");
        assert!(symmetric(&Vault::default(), "decrypt", params).is_err());
    }

    #[test]
    fn separate_cbc_matches_external_openssl_ciphertext() {
        let mut params = request("aes-128", "cbc");
        params["keyMaterial"] = json!("000102030405060708090a0b0c0d0e0f");
        params["iv"] = json!("101112131415161718191a1b1c1d1e1f");
        params["plainEncoding"] = json!("utf8");
        params["text"] = json!("hello world");
        assert_eq!(
            symmetric(&Vault::default(), "encrypt", params).unwrap()["text"],
            "cda122e671f0f91095f426334e422b2b"
        );
    }

    #[test]
    fn every_cipher_preserves_binary_bytes_and_packed_interoperability() {
        for (algorithm, mode) in [
            ("aes-128", "gcm"),
            ("aes-192", "gcm"),
            ("aes-256", "gcm"),
            ("aes-128", "cbc"),
            ("aes-192", "cbc"),
            ("aes-256", "cbc"),
            ("aes-128", "cfb"),
            ("aes-192", "cfb"),
            ("aes-256", "cfb"),
            ("aes-128", "ofb"),
            ("aes-192", "ofb"),
            ("aes-256", "ofb"),
            ("aes-128", "ecb"),
            ("aes-192", "ecb"),
            ("aes-256", "ecb"),
            ("sm4-128", "cbc"),
            ("sm4-128", "ecb"),
        ] {
            let mut params = request(algorithm, mode);
            params["cipherEncoding"] = json!("base64");
            params["parameterEncoding"] = json!("base64");
            params["text"] = json!("00ff8081");
            let encrypted = symmetric(&Vault::default(), "encrypt", params.clone()).unwrap();
            params["iv"] = encrypted["iv"].clone();
            params["tag"] = encrypted["tag"].clone();
            params["text"] = encrypted["text"].clone();
            assert_eq!(
                symmetric(&Vault::default(), "decrypt", params.clone()).unwrap()["text"],
                "00ff8081"
            );

            let mut packed = B64.decode(encrypted["iv"].as_str().unwrap()).unwrap();
            packed.extend(B64.decode(encrypted["text"].as_str().unwrap()).unwrap());
            packed.extend(B64.decode(encrypted["tag"].as_str().unwrap()).unwrap());
            params["payloadFormat"] = json!("packed");
            params["text"] = json!(B64.encode(packed));
            let plain = symmetric(&Vault::default(), "decrypt", params).unwrap();
            assert_eq!(plain["text"], "00ff8081");
            assert_eq!(plain["textEncoding"], "hex");
        }
    }

    #[test]
    fn sm4_accepts_explicit_utf8_key_material() {
        let mut params = request("sm4-128", "ecb");
        params["payloadFormat"] = json!("packed");
        params["keyMaterial"] = json!("1234567890123456");
        params["keyEncoding"] = json!("utf8");
        params["text"] = json!("hello");

        let encrypted = symmetric(&Vault::default(), "encrypt", params.clone()).unwrap();
        params["text"] = encrypted["text"].clone();
        let decrypted = symmetric(&Vault::default(), "decrypt", params).unwrap();

        assert_eq!(decrypted["text"], "hello");
        assert_eq!(decrypted["textEncoding"], "utf8");
    }

    #[test]
    fn sm4_auto_detects_sixteen_character_key_material_as_utf8() {
        let mut params = request("sm4-128", "ecb");
        params["payloadFormat"] = json!("packed");
        params["keyMaterial"] = json!("1234567890123456");
        params["keyEncoding"] = json!("auto");
        params["text"] = json!("hello");

        let encrypted = symmetric(&Vault::default(), "encrypt", params.clone()).unwrap();
        params["text"] = encrypted["text"].clone();

        assert_eq!(
            symmetric(&Vault::default(), "decrypt", params).unwrap()["text"],
            "hello"
        );
    }

    #[test]
    fn symmetric_rejects_unknown_key_encoding() {
        let mut params = request("sm4-128", "ecb");
        params["keyEncoding"] = json!("binary");
        assert!(symmetric(&Vault::default(), "encrypt", params).is_err());
    }

    #[test]
    fn sm4_rejects_aes_only_modes_on_every_path() {
        for mode in ["gcm", "cfb", "ofb"] {
            let separate = request("sm4-128", mode);
            assert!(symmetric(&Vault::default(), "encrypt", separate).is_err());

            let mut packed = request("sm4-128", mode);
            packed["payloadFormat"] = json!("packed");
            packed["text"] = json!("hello");
            assert!(symmetric(&Vault::default(), "encrypt", packed).is_err());
            assert!(sm4_encrypt(&[0; 16], b"hello", mode).is_err());
        }
    }

    #[test]
    fn invalid_parameters_return_errors_instead_of_panicking() {
        let mut params = request("aes-128", "gcm");
        params["iv"] = json!("00");
        assert!(symmetric(&Vault::default(), "encrypt", params.clone()).is_err());
        params["iv"] = json!("00".repeat(12));
        params["tag"] = json!("00");
        assert!(symmetric(&Vault::default(), "decrypt", params.clone()).is_err());
        params["keyMaterial"] = json!("00");
        assert!(symmetric(&Vault::default(), "encrypt", params).is_err());
        assert!(symmetric(&Vault::default(), "encrypt", request("sm4-128", "gcm")).is_err());
        let mut params = request("aes-128", "cbc");
        params["iv"] = json!("00".repeat(16));
        params["text"] = json!("00");
        assert!(symmetric(&Vault::default(), "decrypt", params).is_err());
    }

    #[test]
    fn hmac_rejects_unknown_algorithms() {
        assert!(hmac_op(
            &Vault::default(),
            json!({ "algorithm": "hmac-blake2", "text": "hello", "keyMaterial": "0b".repeat(32) }),
        )
        .is_err());
    }

    #[test]
    fn hmac_sha_family_matches_rfc4231_case1() {
        // RFC 4231 test case 1
        let key = "0b".repeat(20);
        let text = "Hi There";
        let digest = |algorithm: &str| {
            hmac_op(
                &Vault::default(),
                json!({ "algorithm": algorithm, "text": text, "keyMaterial": key }),
            )
            .unwrap()["digest"]
                .as_str()
                .unwrap()
                .to_string()
        };
        assert_eq!(
            digest("hmac-sha256"),
            "b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7"
        );
        assert_eq!(
            digest("hmac-sha384"),
            "afd03944d84895626b0825f4ab46907f15f9dadbe4101ec682aa034c7cebc59cfaea9ea9076ede7f4af152e8b2fa9cb6"
        );
        assert_eq!(
            digest("hmac-sha512"),
            "87aa7cdea5ef619d4ff0b4241a1d6cb02379f4e2ce4ec2787ad0b30545e17cdedaa833b7d6b8a702038b274eaea3f4e4be9d914eeb61f1702e696c203a126854"
        );
        assert_eq!(
            digest("hmac-sha1"),
            "b617318655057264e28bc0b6fb378c8ef146be00"
        );
    }

    #[test]
    fn ssh_public_key_parser_checks_wire_type_and_key_length() {
        fn ssh_blob(fields: &[&[u8]]) -> Vec<u8> {
            let mut out = Vec::new();
            for field in fields {
                out.extend_from_slice(&(field.len() as u32).to_be_bytes());
                out.extend_from_slice(field);
            }
            out
        }
        let blob = ssh_blob(&[b"ssh-ed25519", &[7u8; 32]]);
        let line = format!("ssh-ed25519 {} a comment", B64.encode(&blob));
        let info = ssh_fingerprint(&line).unwrap();
        assert_eq!(info["type"], "ssh-ed25519");
        assert_eq!(info["comment"], "a comment");

        let mismatched = format!("ssh-rsa {}", B64.encode(&blob));
        assert!(ssh_fingerprint(&mismatched).is_err());
        let short = ssh_blob(&[b"ssh-ed25519", &[7u8; 31]]);
        assert!(ssh_fingerprint(&format!("ssh-ed25519 {}", B64.encode(short))).is_err());
    }

    #[test]
    fn asymmetric_output_encoding_is_explicit_and_backward_compatible() {
        assert_eq!(
            encode_asymmetric_output(&[0, 255], &json!({ "outputEncoding": "hex" })).unwrap(),
            ("00ff".to_string(), "hex")
        );
        assert_eq!(
            encode_asymmetric_output(&[0, 255], &json!({ "outputEncoding": "base64" })).unwrap(),
            ("AP8=".to_string(), "base64")
        );
        assert!(encode_asymmetric_output(&[0, 255], &json!({ "outputEncoding": "utf8" })).is_err());
        assert_eq!(
            encode_asymmetric_output(&[0, 255], &json!({})).unwrap(),
            ("\u{0}\u{fffd}".to_string(), "utf8")
        );
        assert!(encode_asymmetric_output(&[], &json!({ "outputEncoding": "rot13" })).is_err());
    }

    #[test]
    fn modern_ciphers_round_trip_and_authenticate() {
        for algorithm in [
            "chacha20-poly1305",
            "xchacha20-poly1305",
            "aes-256-gcm-siv",
            "aes-256-siv",
            "aes-256-ccm",
            "aes-256-ctr",
        ] {
            let key_bytes = if algorithm == "aes-256-siv" { 64 } else { 32 };
            let encrypted = modern_cipher_op(&Vault::default(), json!({
                "algorithm": algorithm, "op": "encrypt", "text": "hello", "aad": if algorithm == "aes-256-ctr" { "" } else { "context" },
                "keyMaterial": "11".repeat(key_bytes), "keyEncoding": "hex", "nonceEncoding": "hex"
            })).unwrap();
            let decrypted = modern_cipher_op(&Vault::default(), json!({
                "algorithm": algorithm, "op": "decrypt", "text": encrypted["text"], "nonce": encrypted["nonce"],
                "aad": if algorithm == "aes-256-ctr" { "" } else { "context" }, "keyMaterial": "11".repeat(key_bytes),
                "keyEncoding": "hex", "nonceEncoding": "hex", "inputEncoding": "base64", "outputEncoding": "utf8"
            })).unwrap();
            assert_eq!(decrypted["text"], "hello");
        }
    }

    #[test]
    fn specialized_crypto_round_trips_and_matches_cmac_vector() {
        for algorithm in ["aes-kw", "aes-kwp"] {
            let input = if algorithm == "aes-kw" {
                "00112233445566778899aabbccddeeff"
            } else {
                "00112233445566"
            };
            let wrapped = specialized_crypto_op(
                &Vault::default(),
                json!({
                    "algorithm": algorithm, "op": "encrypt", "text": input,
                    "keyMaterial": "00".repeat(32), "keyEncoding": "hex"
                }),
            )
            .unwrap();
            let plain = specialized_crypto_op(
                &Vault::default(),
                json!({
                    "algorithm": algorithm, "op": "decrypt", "text": wrapped["text"],
                    "keyMaterial": "00".repeat(32), "keyEncoding": "hex"
                }),
            )
            .unwrap();
            assert_eq!(plain["text"], input);
        }

        let xts = specialized_crypto_op(
            &Vault::default(),
            json!({
                "algorithm": "aes-xts", "op": "encrypt", "text": "00112233445566778899aabbccddeeff",
                "keyMaterial": "11".repeat(32), "keyEncoding": "hex", "sector": 7
            }),
        )
        .unwrap();
        let restored = specialized_crypto_op(
            &Vault::default(),
            json!({
                "algorithm": "aes-xts", "op": "decrypt", "text": xts["text"],
                "keyMaterial": "11".repeat(32), "keyEncoding": "hex", "sector": 7
            }),
        )
        .unwrap();
        assert_eq!(restored["text"], "00112233445566778899aabbccddeeff");

        let ff1 = specialized_crypto_op(
            &Vault::default(),
            json!({
                "algorithm": "aes-ff1", "op": "encrypt", "text": "0123456789",
                "keyMaterial": "22".repeat(16), "keyEncoding": "hex", "radix": 10
            }),
        )
        .unwrap();
        let ff1_plain = specialized_crypto_op(
            &Vault::default(),
            json!({
                "algorithm": "aes-ff1", "op": "decrypt", "text": ff1["text"],
                "keyMaterial": "22".repeat(16), "keyEncoding": "hex", "radix": 10
            }),
        )
        .unwrap();
        assert_eq!(ff1_plain["text"], "0123456789");

        let cmac = specialized_crypto_op(&Vault::default(), json!({
            "algorithm": "aes-cmac", "text": "", "inputEncoding": "hex", "outputEncoding": "hex",
            "keyMaterial": "2b7e151628aed2a6abf7158809cf4f3c", "keyEncoding": "hex"
        })).unwrap();
        assert_eq!(cmac["text"], "bb1d6929e95937287fa37d129b756746");

        let gmac = specialized_crypto_op(
            &Vault::default(),
            json!({
                "algorithm": "aes-128-gmac", "text": "authenticated data", "inputEncoding": "utf8",
                "keyMaterial": "00".repeat(16), "keyEncoding": "hex", "nonce": "00".repeat(12)
            }),
        )
        .unwrap();
        assert_eq!(gmac["text"].as_str().unwrap().len(), 32);
    }

    #[test]
    fn hpke_and_ml_kem_round_trip() {
        let hpke_keys = kem_op(
            &Vault::default(),
            json!({ "algorithm": "hpke-x25519-chacha20", "op": "generate", "text": "" }),
        )
        .unwrap();
        let encrypted = kem_op(
            &Vault::default(),
            json!({
                "algorithm": "hpke-x25519-chacha20", "op": "encrypt", "text": "hello",
                "publicKey": hpke_keys["publicKey"], "info": "toolbox", "aad": "context"
            }),
        )
        .unwrap();
        let decrypted = kem_op(&Vault::default(), json!({
            "algorithm": "hpke-x25519-chacha20", "op": "decrypt", "text": encrypted["text"],
            "privateKey": hpke_keys["privateKey"], "encapsulatedKey": encrypted["encapsulatedKey"],
            "info": "toolbox", "aad": "context"
        })).unwrap();
        assert_eq!(decrypted["text"], "hello");

        for algorithm in ["ml-kem-768", "ml-kem-1024"] {
            let keys = kem_op(
                &Vault::default(),
                json!({ "algorithm": algorithm, "op": "generate", "text": "" }),
            )
            .unwrap();
            let encapsulated = kem_op(&Vault::default(), json!({
                "algorithm": algorithm, "op": "encapsulate", "text": "", "publicKey": keys["publicKey"]
            })).unwrap();
            let decapsulated = kem_op(&Vault::default(), json!({
                "algorithm": algorithm, "op": "decapsulate", "text": "", "privateKey": keys["privateKey"],
                "encapsulatedKey": encapsulated["encapsulatedKey"]
            })).unwrap();
            assert_eq!(encapsulated["sharedSecret"], decapsulated["sharedSecret"]);
        }
    }

    #[test]
    fn supported_kdfs_are_deterministic_and_bounded() {
        for algorithm in ["pbkdf2-sha256", "scrypt", "argon2id", "hkdf-sha256"] {
            let params = json!({
                "algorithm": algorithm, "text": "password", "salt": "0011223344556677", "saltEncoding": "hex",
                "length": 32, "iterations": 10_000, "memoryKiB": 8192, "logN": 10
            });
            let first = kdf_op(params.clone()).unwrap();
            let second = kdf_op(params).unwrap();
            assert_eq!(first["text"], second["text"]);
            assert_eq!(first["text"].as_str().unwrap().len(), 64);
        }
    }

    #[test]
    fn rsa_and_sm2_signatures_verify_and_detect_changes() {
        use rsa::pkcs8::{EncodePrivateKey, EncodePublicKey, LineEnding};
        let private = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
        let private_pem = private.to_pkcs8_pem(LineEnding::LF).unwrap().to_string();
        let public_pem = RsaPublicKey::from(&private)
            .to_public_key_pem(LineEnding::LF)
            .unwrap();
        for algorithm in ["rsa-pss-sha256", "rsa-pkcs1-sha256"] {
            let signed = signature_op(&Vault::default(), json!({ "algorithm": algorithm, "op": "sign", "text": "hello", "keyMaterial": private_pem })).unwrap();
            assert_eq!(signature_op(&Vault::default(), json!({ "algorithm": algorithm, "op": "verify", "text": "hello", "signature": signed["text"], "keyMaterial": public_pem })).unwrap()["valid"], true);
            assert_eq!(signature_op(&Vault::default(), json!({ "algorithm": algorithm, "op": "verify", "text": "changed", "signature": signed["text"], "keyMaterial": public_pem })).unwrap()["valid"], false);
        }
        let (sm2_private, sm2_public) = smcrypto::sm2::gen_keypair();
        let signed = signature_op(&Vault::default(), json!({ "algorithm": "sm2-sm3", "op": "sign", "text": "hello", "keyMaterial": sm2_private })).unwrap();
        assert_eq!(signature_op(&Vault::default(), json!({ "algorithm": "sm2-sm3", "op": "verify", "text": "hello", "signature": signed["text"], "keyMaterial": sm2_public })).unwrap()["valid"], true);
    }

    #[test]
    fn rsa_decrypt_honors_output_encoding_and_default_compatibility() {
        use rsa::pkcs8::{EncodePrivateKey, EncodePublicKey, LineEnding};

        let mut rng = rand::thread_rng();
        let private = RsaPrivateKey::new(&mut rng, 2048).unwrap();
        let private_pem = private.to_pkcs8_pem(LineEnding::LF).unwrap().to_string();
        let public_pem = RsaPublicKey::from(&private)
            .to_public_key_pem(LineEnding::LF)
            .unwrap();
        let encrypted = crypto_op(
            &Vault::default(),
            json!({
                "action": "rsa",
                "op": "encrypt",
                "keyMaterial": public_pem.clone(),
                "text": "hello"
            }),
        )
        .unwrap();

        let default_output = crypto_op(
            &Vault::default(),
            json!({
                "action": "rsa",
                "op": "decrypt",
                "keyMaterial": private_pem.clone(),
                "text": encrypted["text"].as_str().unwrap()
            }),
        )
        .unwrap();
        assert_eq!(default_output["text"], "hello");
        assert_eq!(default_output["textEncoding"], "utf8");

        let hex_output = crypto_op(
            &Vault::default(),
            json!({
                "action": "rsa",
                "op": "decrypt",
                "keyMaterial": private_pem.clone(),
                "text": encrypted["text"].as_str().unwrap(),
                "outputEncoding": "hex"
            }),
        )
        .unwrap();
        assert_eq!(hex_output["text"], hex::encode(b"hello"));
        assert_eq!(hex_output["textEncoding"], "hex");

        let encoded = crypto_op(
            &Vault::default(),
            json!({
                "action": "rsa", "op": "encrypt", "keyMaterial": public_pem,
                "text": "00ff", "plainEncoding": "hex", "cipherEncoding": "hex",
                "padding": "oaep", "oaepHash": "sha512"
            }),
        )
        .unwrap();
        assert_eq!(encoded["textEncoding"], "hex");
        assert_eq!(encoded["oaepHash"], "sha512");
        let decoded = crypto_op(
            &Vault::default(),
            json!({
                "action": "rsa", "op": "decrypt", "keyMaterial": private_pem,
                "text": encoded["text"], "cipherEncoding": "hex", "outputEncoding": "hex",
                "padding": "oaep", "oaepHash": "sha512"
            }),
        )
        .unwrap();
        assert_eq!(decoded["text"], "00ff");
    }

    #[test]
    fn hash_supports_md5_variants_sha224_sha384_and_sha3() {
        let digest = |algorithm| {
            hash_op(json!({ "algorithm": algorithm, "text": "" })).unwrap()["digest"]
                .as_str()
                .unwrap()
                .to_string()
        };
        assert_eq!(digest("md5-16"), "8f00b204e9800998");
        assert_eq!(digest("md5"), "d41d8cd98f00b204e9800998ecf8427e");
        assert_eq!(
            digest("sha-224"),
            "d14a028c2a3a2bc9476102bb288234c415a2b01f828ea62ac5b3e42f"
        );
        assert_eq!(digest("sha-384"), "38b060a751ac96384cd9327eb1b1e36a21fdb71114be07434c0cc7bf63f6e1da274edebfe76f65fbd51ad2f14898b95b");
        assert_eq!(
            digest("sha3-256"),
            "a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a"
        );
    }

    #[test]
    fn streamed_hashes_match_single_request_digests_across_chunks() {
        let input = vec![b'a'; MAX_HASH_CHUNK_BYTES + 17];
        let mut sessions = HashSessions::default();
        let started =
            hash_stream_op(&mut sessions, "toolbox/hash-stream/begin", json!({})).unwrap();
        let session_id = started["sessionId"].as_str().unwrap();
        for chunk in input.chunks(128 * 1024) {
            hash_stream_op(
                &mut sessions,
                "toolbox/hash-stream/update",
                json!({ "sessionId": session_id, "dataBase64": B64.encode(chunk) }),
            )
            .unwrap();
        }
        let streamed = hash_stream_op(
            &mut sessions,
            "toolbox/hash-stream/finalize",
            json!({ "sessionId": session_id }),
        )
        .unwrap();
        assert_eq!(streamed["bytes"], input.len());
        let encoded = B64.encode(&input);
        for algorithm in ["md5-16", "md5", "sha-224", "sha3-256", "sm3"] {
            let expected = hash_op(json!({
                "algorithm": algorithm,
                "dataBase64": encoded,
            }))
            .unwrap();
            assert_eq!(streamed["digests"][algorithm], expected["digest"]);
        }
    }

    #[test]
    fn oversized_hash_crypto_and_certificate_inputs_are_rejected() {
        let hash_input = "x".repeat(MAX_HASH_INPUT_BYTES + 1);
        assert!(hash_op(json!({ "algorithm": "sha-256", "text": hash_input })).is_err());

        let crypto_input = "x".repeat(MAX_CRYPTO_INPUT_BYTES + 1);
        let mut params = request("aes-128", "gcm");
        params["payloadFormat"] = json!("packed");
        params["text"] = json!(crypto_input);
        assert!(symmetric(&Vault::default(), "encrypt", params).is_err());

        let cert_input = "x".repeat(MAX_CERT_INPUT_BYTES + 1);
        assert!(cert_op(json!({ "pem": cert_input })).is_err());
    }

    #[test]
    fn sm2_rejects_invalid_inputs_without_panicking_and_accepts_private_key_encryption() {
        let invalid_key = json!({
            "action": "sm2", "op": "encrypt", "keyMaterial": "not-a-key", "text": "hello"
        });
        assert!(crypto_op(&Vault::default(), invalid_key).is_err());

        let (private, _) = smcrypto::sm2::gen_keypair();
        let encrypted = crypto_op(
            &Vault::default(),
            json!({ "action": "sm2", "op": "encrypt", "keyMaterial": private, "text": "hello" }),
        )
        .unwrap();
        let decrypted = crypto_op(
            &Vault::default(),
            json!({ "action": "sm2", "op": "decrypt", "keyMaterial": private, "text": encrypted["text"] }),
        )
        .unwrap();
        assert_eq!(decrypted["text"], "hello");

        let decoded_hex = crypto_op(
            &Vault::default(),
            json!({
                "action": "sm2",
                "op": "decrypt",
                "keyMaterial": private,
                "text": encrypted["text"],
                "outputEncoding": "hex"
            }),
        )
        .unwrap();
        assert_eq!(decoded_hex["text"], hex::encode(b"hello"));
        assert_eq!(decoded_hex["textEncoding"], "hex");

        let truncated = json!({
            "action": "sm2", "op": "decrypt", "keyMaterial": private, "text": B64.encode([0u8; 16])
        });
        assert!(crypto_op(&Vault::default(), truncated).is_err());
    }
}
