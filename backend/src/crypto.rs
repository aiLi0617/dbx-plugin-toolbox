use aes::Aes128;
use aes::Aes256;
use aes_gcm::aead::{Aead, KeyInit as GcmKeyInit, Payload};
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
use rsa::{Oaep, Pkcs1v15Encrypt, Pkcs1v15Sign, Pss, RsaPrivateKey, RsaPublicKey};
use serde_json::{json, Map, Value};
use sha1::Sha1;
use sha2::{Digest, Sha256, Sha384, Sha512};
use sm3::Sm3;
use x509_parser::prelude::*;
use zeroize::Zeroizing;

use crate::helpers::{bad, bool_param, err, opt_str, str_param, u32_param};
use crate::keystore::{decode_key_bytes, Vault};

type HmacSha256 = Hmac<Sha256>;
type HmacSha384 = Hmac<Sha384>;
type HmacSha512 = Hmac<Sha512>;
type HmacSm3 = Hmac<Sm3>;
type Sm4CbcEnc = CbcEncryptor<sm4::Sm4>;
type Sm4CbcDec = CbcDecryptor<sm4::Sm4>;
type Aes128CbcEnc = CbcEncryptor<Aes128>;
type Aes128CbcDec = CbcDecryptor<Aes128>;
type Aes256CbcEnc = CbcEncryptor<Aes256>;
type Aes256CbcDec = CbcDecryptor<Aes256>;

// Keep sidecar requests bounded even when the UI is bypassed. The browser
// currently limits file hashing to 16 MiB; crypto and certificate operations
// use the same practical ceiling while retaining room for encoded envelopes.
const MAX_JSON_INPUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_HASH_INPUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_CRYPTO_INPUT_BYTES: usize = 16 * 1024 * 1024;
const MAX_PACKED_CRYPTO_BYTES: usize = MAX_CRYPTO_INPUT_BYTES + 64;
const MAX_CERT_INPUT_BYTES: usize = 2 * 1024 * 1024;
const MAX_KEY_INPUT_BYTES: usize = 1024 * 1024;

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
        "md5" => hex::encode(Md5::digest(bytes)),
        "sha-1" | "sha1" => hex::encode(Sha1::digest(bytes)),
        "sha-256" | "sha256" => hex::encode(Sha256::digest(bytes)),
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

pub fn crypto_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let action = str_param(&params, "action")?.to_string();
    match action.as_str() {
        "encrypt" | "decrypt" => symmetric(vault, action.as_str(), params),
        "hmac" => hmac_op(vault, params),
        "xor" => xor_op(vault, params),
        "rsa" => rsa_op(vault, params),
        "sm2" => sm2_op(vault, params),
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
                            .chunks_exact(2)
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
    let key = resolve_key(vault, &params, &algorithm)?;
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
            ("aes-256", "gcm") | ("aes", "gcm") if key.len() == 32 => {
                aes256_gcm_encrypt(&key, plaintext)?
            }
            ("aes-128", "cbc") | ("aes", "cbc") if key.len() == 16 => {
                cbc_encrypt_aes128(&key, plaintext)?
            }
            ("aes-256", "cbc") | ("aes", "cbc") if key.len() == 32 => {
                cbc_encrypt_aes256(&key, plaintext)?
            }
            ("sm4-128", _) | ("sm4", _) => sm4_encrypt(&key, plaintext, mode)?,
            _ => return Err(bad("Unsupported algorithm/mode or key length")),
        };
        Ok(json!({ "ok": true, "text": packed }))
    } else {
        let packed = input;
        let plain = match (algorithm, mode) {
            ("aes-128", "gcm") | ("aes", "gcm") if key.len() == 16 => {
                aes128_gcm_decrypt(&key, packed)?
            }
            ("aes-256", "gcm") | ("aes", "gcm") if key.len() == 32 => {
                aes256_gcm_decrypt(&key, packed)?
            }
            ("aes-128", "cbc") | ("aes", "cbc") if key.len() == 16 => {
                cbc_decrypt_aes128(&key, packed)?
            }
            ("aes-256", "cbc") | ("aes", "cbc") if key.len() == 32 => {
                cbc_decrypt_aes256(&key, packed)?
            }
            ("sm4-128", _) | ("sm4", _) => sm4_decrypt(&key, packed, mode)?,
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
        ("aes-128", "gcm" | "cbc") => key.len() == 16,
        ("aes-256", "gcm" | "cbc") => key.len() == 32,
        ("aes", "gcm" | "cbc") => key.len() == 16 || key.len() == 32,
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
        "cbc" => 16,
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
    let sm4 = algorithm.starts_with("sm4");
    if encrypting {
        let encrypted = if mode == "ecb" {
            ecb::Encryptor::<sm4::Sm4>::new(key.into()).encrypt_padded_vec_mut::<Pkcs7>(data)
        } else if sm4 {
            Sm4CbcEnc::new(key.into(), iv.into()).encrypt_padded_vec_mut::<Pkcs7>(data)
        } else if key.len() == 16 {
            Aes128CbcEnc::new(key.into(), iv.into()).encrypt_padded_vec_mut::<Pkcs7>(data)
        } else {
            Aes256CbcEnc::new(key.into(), iv.into()).encrypt_padded_vec_mut::<Pkcs7>(data)
        };
        Ok(encrypted)
    } else {
        let decrypted = if mode == "ecb" {
            ecb::Decryptor::<sm4::Sm4>::new(key.into()).decrypt_padded_vec_mut::<Pkcs7>(data)
        } else if sm4 {
            Sm4CbcDec::new(key.into(), iv.into()).decrypt_padded_vec_mut::<Pkcs7>(data)
        } else if key.len() == 16 {
            Aes128CbcDec::new(key.into(), iv.into()).decrypt_padded_vec_mut::<Pkcs7>(data)
        } else {
            Aes256CbcDec::new(key.into(), iv.into()).decrypt_padded_vec_mut::<Pkcs7>(data)
        };
        decrypted.map_err(|_| err("Ciphertext or PKCS#7 padding is invalid"))
    }
}

fn hmac_op(vault: &Vault, params: Value) -> Result<Value, PluginError> {
    let algorithm = opt_str(&params, "algorithm")
        .unwrap_or("hmac-sha256")
        .to_ascii_lowercase();
    if !matches!(
        algorithm.as_str(),
        "hmac" | "hmac-sha256" | "hmac-sm3" | "sm3"
    ) {
        return Err(bad("Unsupported HMAC algorithm"));
    }
    let key = resolve_key(vault, &params, &algorithm)?;
    let text = str_param(&params, "text")?;
    ensure_input_size(text, "Crypto input", MAX_CRYPTO_INPUT_BYTES)?;
    let text = text.as_bytes();
    let digest = match algorithm.as_str() {
        "hmac-sm3" | "sm3" => {
            let mut mac: HmacSm3 =
                HmacMac::new_from_slice(&key).map_err(|_| bad("Invalid HMAC key"))?;
            mac.update(text);
            hex::encode(mac.finalize().into_bytes())
        }
        _ => {
            let mut mac: HmacSha256 =
                HmacMac::new_from_slice(&key).map_err(|_| bad("Invalid HMAC key"))?;
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
    match op {
        "encrypt" => {
            ensure_input_size(text, "RSA input", MAX_CRYPTO_INPUT_BYTES)?;
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
            let data =
                decode_base64_limited(text.trim(), "RSA ciphertext", MAX_CRYPTO_INPUT_BYTES)?;
            let plain = if padding == "pkcs1" {
                private.decrypt(Pkcs1v15Encrypt, &data)
            } else {
                private.decrypt(Oaep::new::<Sha256>(), &data)
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
    _algorithm: &str,
) -> Result<Zeroizing<Vec<u8>>, PluginError> {
    if let Some(id) = opt_str(params, "keyId") {
        if !id.is_empty() {
            let material = &vault.material(id)?.material;
            ensure_input_size(material, "Key material", MAX_KEY_INPUT_BYTES)?;
            return decode_key_bytes(material).map(Zeroizing::new);
        }
    }
    let material = opt_str(params, "keyMaterial").unwrap_or("");
    if material.is_empty() {
        return Err(bad("Provide keyId or keyMaterial"));
    }
    ensure_input_size(material, "Key material", MAX_KEY_INPUT_BYTES)?;
    decode_key_bytes(material).map(Zeroizing::new)
}

fn resolve_text_key(vault: &Vault, params: &Value) -> Result<Zeroizing<String>, PluginError> {
    if let Some(id) = opt_str(params, "keyId") {
        if !id.is_empty() {
            let material = &vault.material(id)?.material;
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
    let data = decode_base64_limited(packed.trim(), "Ciphertext", MAX_PACKED_CRYPTO_BYTES)?;
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
            "keyMaterial": if algorithm == "aes-256" { "00".repeat(32) } else { "00".repeat(16) },
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
            ("aes-256", "gcm"),
            ("aes-128", "cbc"),
            ("aes-256", "cbc"),
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
            json!({ "algorithm": "hmac-sha512", "text": "hello" }),
        )
        .is_err());
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
                "keyMaterial": public_pem,
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
                "keyMaterial": private_pem,
                "text": encrypted["text"].as_str().unwrap(),
                "outputEncoding": "hex"
            }),
        )
        .unwrap();
        assert_eq!(hex_output["text"], hex::encode(b"hello"));
        assert_eq!(hex_output["textEncoding"], "hex");
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
