use std::collections::BTreeMap;
use std::sync::LazyLock;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use serde_json::json;

use super::{data::read_json, Args, ToolResult};
use crate::{crypto, helpers::bad};

pub(super) fn cert(args: Args) -> ToolResult {
    let text = args.text("pem").trim();
    let certificate = text.starts_with("-----BEGIN CERTIFICATE-----\n")
        || text.starts_with("-----BEGIN CERTIFICATE-----\r\n");
    let public_key = matches!(
        text.split_whitespace().next(),
        Some(
            "ssh-rsa"
                | "ssh-ed25519"
                | "ecdsa-sha2-nistp256"
                | "ecdsa-sha2-nistp384"
                | "ecdsa-sha2-nistp521"
        )
    );
    if certificate {
        if !text.ends_with("\n-----END CERTIFICATE-----")
            || text.matches("-----BEGIN ").count() != 1
            || text.matches("-----END ").count() != 1
        {
            return Err(bad("Expected exactly one PEM X.509 certificate"));
        }
    } else if !public_key || text.lines().count() != 1 {
        return Err(bad(
            "Expected one PEM X.509 certificate or OpenSSH public key",
        ));
    }
    crypto::cert_op(json!({ "pem": text }))
}

pub(super) fn jwt_decode(args: Args) -> ToolResult {
    let mut sections = args.text("text").trim().split('.');
    let (Some(header), Some(payload), Some(signature), None) = (
        sections.next(),
        sections.next(),
        sections.next(),
        sections.next(),
    ) else {
        return Err(bad("Expected a compact JWT with three sections"));
    };
    let decode = |section, name| -> Result<String, dbx_plugin_sdk::PluginError> {
        let bytes = URL_SAFE_NO_PAD
            .decode(section)
            .map_err(|_| bad(format!("JWT {name} must be unpadded Base64URL")))?;
        let text =
            String::from_utf8(bytes).map_err(|_| bad(format!("JWT {name} must be UTF-8")))?;
        let value = read_json(&text)
            .map_err(|error| bad(format!("Invalid JWT {name}: {}", error.message)))?;
        if !value.get().starts_with('{') {
            return Err(bad(format!("JWT {name} must be a JSON object")));
        }
        Ok(text)
    };
    if URL_SAFE_NO_PAD.decode(signature).is_err() {
        return Err(bad("JWT signature section must be unpadded Base64URL"));
    }
    Ok(json!({
        "header": decode(header, "header")?, "payload": decode(payload, "payload")?,
        "signatureVerified": false
    }))
}

static IBAN_LENGTHS: LazyLock<BTreeMap<String, usize>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../../src/lib/data/iban-lengths.json"))
        .expect("valid IBAN country table")
});

pub(super) fn iban(args: Args) -> ToolResult {
    let value = args
        .text("text")
        .chars()
        .filter(|ch| !ch.is_whitespace())
        .collect::<String>()
        .to_ascii_uppercase();
    if value.len() > 34 {
        return Err(bad("IBAN exceeds 34 characters"));
    }
    let bytes = value.as_bytes();
    let country = value.get(..2).unwrap_or("");
    let expected = IBAN_LENGTHS.get(country).copied();
    let syntax = bytes.len() >= 5
        && bytes[..2].iter().all(u8::is_ascii_uppercase)
        && bytes[2..4].iter().all(u8::is_ascii_digit)
        && bytes[4..].iter().all(u8::is_ascii_alphanumeric);
    let mut remainder = 0_u32;
    if syntax {
        for &byte in bytes[4..].iter().chain(&bytes[..4]) {
            remainder = if byte.is_ascii_digit() {
                (remainder * 10 + u32::from(byte - b'0')) % 97
            } else {
                (remainder * 100 + u32::from(byte - b'A' + 10)) % 97
            };
        }
    }
    let checksum_valid = syntax && remainder == 1;
    Ok(json!({
        "iban": value, "country": country, "expectedLength": expected, "checksumValid": checksum_valid,
        "valid": checksum_valid && expected == Some(bytes.len())
    }))
}
