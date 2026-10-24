// TOTP account data and computation. Persistence belongs exclusively to the vault.
use crate::helpers::{bad, err, opt_str};
use dbx_plugin_sdk::PluginError;
use hmac::{Hmac, Mac};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha1::Sha1;
use sha2::{Sha256, Sha512};
use std::collections::HashSet;
use uuid::Uuid;
use zeroize::{Zeroize, Zeroizing};
const MAX_ENTRIES: usize = 512;
#[derive(Clone, Serialize, Deserialize)]
pub struct Entry {
    pub id: String,
    pub name: String,
    pub issuer: String,
    pub account: String,
    #[serde(default)]
    pub note: String,
    pub digits: u32,
    pub period: u32,
    pub algorithm: String,
    pub secret: String,
    pub created_at: String,
}
impl Drop for Entry {
    fn drop(&mut self) {
        self.secret.zeroize();
    }
}

pub fn save(entries: &mut Vec<Entry>, params: &Value) -> Result<Value, PluginError> {
    let supplied_id = opt_str(params, "id");
    let index = if let Some(id) = supplied_id {
        Some(
            entries
                .iter()
                .position(|e| e.id == id)
                .ok_or_else(|| bad("Unknown TOTP entry"))?,
        )
    } else {
        None
    };
    if index.is_none() && entries.len() >= MAX_ENTRIES {
        return Err(bad("TOTP store is full"));
    }
    let mut entry = if let Some(at) = index {
        entries[at].clone()
    } else {
        Entry {
            id: Uuid::new_v4().to_string(),
            name: String::new(),
            issuer: String::new(),
            account: String::new(),
            note: String::new(),
            digits: 6,
            period: 30,
            algorithm: "SHA-1".into(),
            secret: String::new(),
            created_at: now_string(),
        }
    };
    entry.name = text(params, "name", 128, false)?;
    entry.issuer = text(params, "issuer", 128, true)?;
    entry.account = text(params, "account", 256, true)?;
    if let Some(value) = params.get("note") {
        entry.note = value
            .as_str()
            .ok_or_else(|| bad("Invalid TOTP note"))?
            .replace("\r\n", "\n")
            .replace('\r', "\n")
            .trim()
            .to_string();
        if !valid_note(&entry.note) {
            return Err(bad("Invalid TOTP note"));
        }
    }
    if let Some(raw) = params.get("secret") {
        entry.secret = normalize_secret(
            raw.as_str()
                .ok_or_else(|| bad("TOTP secret must be Base32"))?,
        )?;
    }
    entry.digits = number(params, "digits", entry.digits, 6, 8)?;
    if !matches!(entry.digits, 6 | 8) {
        return Err(bad("Invalid TOTP digits"));
    }
    entry.period = number(params, "period", entry.period, 1, 300)?;
    if let Some(raw) = params.get("algorithm") {
        entry.algorithm = algorithm(
            raw.as_str()
                .ok_or_else(|| bad("Unsupported TOTP algorithm"))?,
        )?
        .into();
    }
    let meta = metadata(&entry);
    if let Some(at) = index {
        entries[at] = entry;
    } else {
        entries.push(entry);
    }
    validate(entries)?;
    Ok(json!({"ok": true, "entry": meta}))
}

pub fn metadata(e: &Entry) -> Value {
    json!({"id":e.id,"name":e.name,"issuer":e.issuer,"account":e.account,"note":e.note,"digits":e.digits,"period":e.period,"algorithm":e.algorithm,"createdAt":e.created_at})
}
fn valid_note(note: &str) -> bool {
    note.chars().count() <= 500 && !note.chars().any(|c| c.is_control() && c != '\n')
}
fn text(p: &Value, n: &str, max: usize, empty: bool) -> Result<String, PluginError> {
    let s = match p.get(n) {
        None if empty => "",
        Some(Value::String(s)) => s.trim(),
        _ => return Err(bad("Invalid TOTP entry name")),
    };
    if (!empty && s.is_empty()) || s.chars().count() > max || s.chars().any(char::is_control) {
        return Err(bad("Invalid TOTP entry name"));
    }
    Ok(s.into())
}
fn number(p: &Value, n: &str, default: u32, min: u32, max: u32) -> Result<u32, PluginError> {
    let value = match p.get(n) {
        None => default,
        Some(v) => v
            .as_u64()
            .and_then(|n| u32::try_from(n).ok())
            .ok_or_else(|| bad("Invalid TOTP parameters"))?,
    };
    if !(min..=max).contains(&value) {
        return Err(bad("Invalid TOTP parameters"));
    }
    Ok(value)
}
fn algorithm(s: &str) -> Result<&'static str, PluginError> {
    match s.to_uppercase().as_str() {
        "SHA1" | "SHA-1" => Ok("SHA-1"),
        "SHA256" | "SHA-256" => Ok("SHA-256"),
        "SHA512" | "SHA-512" => Ok("SHA-512"),
        _ => Err(bad("Unsupported TOTP algorithm")),
    }
}
fn normalize_secret(s: &str) -> Result<String, PluginError> {
    if s.len() > 4096 {
        return Err(bad("TOTP secret must be Base32"));
    }
    let out: String = s
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '-')
        .flat_map(char::to_uppercase)
        .collect();
    decode_base32(&out)?;
    Ok(out.trim_end_matches('=').into())
}
fn decode_base32(s: &str) -> Result<Zeroizing<Vec<u8>>, PluginError> {
    let raw = s.trim_end_matches('=');
    if raw.len() > 4096
        || raw.is_empty()
        || !matches!(raw.len() % 8, 0 | 2 | 4 | 5 | 7)
        || (raw.len() != s.len() && (!s.len().is_multiple_of(8) || s.len() - raw.len() > 6))
    {
        return Err(bad("TOTP secret must be Base32"));
    }
    let mut buffer = 0u32;
    let mut bits = 0u8;
    let mut out = Zeroizing::new(Vec::new());
    for b in raw.bytes() {
        let v = match b {
            b'A'..=b'Z' => b - b'A',
            b'2'..=b'7' => b - b'2' + 26,
            _ => return Err(bad("TOTP secret must be Base32")),
        };
        buffer = (buffer << 5) | v as u32;
        bits += 5;
        if bits >= 8 {
            bits -= 8;
            out.push((buffer >> bits) as u8);
            buffer &= (1 << bits) - 1;
        }
    }
    if buffer != 0 || out.is_empty() {
        return Err(bad("TOTP secret must be Base32"));
    }
    Ok(out)
}
fn code(secret: &str, digits: u32, counter: u64, alg: &str) -> Result<String, PluginError> {
    let key = decode_base32(secret)?;
    let msg = counter.to_be_bytes();
    let raw = Zeroizing::new(match alg {
        "SHA-1" => <Hmac<Sha1> as Mac>::new_from_slice(&key)
            .unwrap()
            .chain_update(msg)
            .finalize()
            .into_bytes()
            .to_vec(),
        "SHA-256" => <Hmac<Sha256> as Mac>::new_from_slice(&key)
            .unwrap()
            .chain_update(msg)
            .finalize()
            .into_bytes()
            .to_vec(),
        "SHA-512" => <Hmac<Sha512> as Mac>::new_from_slice(&key)
            .unwrap()
            .chain_update(msg)
            .finalize()
            .into_bytes()
            .to_vec(),
        _ => return Err(bad("Unsupported TOTP algorithm")),
    });
    let at = (raw[raw.len() - 1] & 15) as usize;
    let n = u32::from_be_bytes(raw[at..at + 4].try_into().unwrap()) & 0x7fff_ffff;
    Ok(format!(
        "{:0width$}",
        n % 10u32.pow(digits),
        width = digits as usize
    ))
}
pub fn windows(entry: &Entry, now: u64) -> Result<Value, PluginError> {
    let counter = now / entry.period as u64;
    let mut windows = vec![];
    for offset in [-1i64, 0, 1] {
        let c = counter.checked_add_signed(offset);
        windows.push(json!({"offset": offset, "code": c.map(|c| code(&entry.secret, entry.digits, c, &entry.algorithm)).transpose()?}));
    }
    Ok(
        json!({"digits": entry.digits, "period": entry.period, "algorithm": entry.algorithm, "remaining": entry.period as u64 - now % entry.period as u64, "counter": counter, "windows": windows}),
    )
}

pub fn validate(entries: &[Entry]) -> Result<(), PluginError> {
    if entries.len() > MAX_ENTRIES {
        return Err(err("TOTP store is too large"));
    }
    let mut ids = HashSet::new();
    for e in entries {
        if Uuid::parse_str(&e.id).is_err()
            || !ids.insert(&e.id)
            || e.name.is_empty()
            || e.name.chars().count() > 128
            || e.issuer.chars().count() > 128
            || e.account.chars().count() > 256
            || !valid_note(&e.note)
            || [&e.name, &e.issuer, &e.account]
                .iter()
                .any(|s| s.chars().any(char::is_control))
            || !matches!(e.digits, 6 | 8)
            || !(1..=300).contains(&e.period)
        {
            return Err(err("TOTP store is corrupt"));
        }
        algorithm(&e.algorithm)?;
        decode_base32(&e.secret)?;
    }
    Ok(())
}
fn now_string() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs()
        .to_string()
}
