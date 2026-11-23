use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use rand::{rngs::OsRng, RngCore};
use serde_json::{json, Value};
use zeroize::Zeroizing;

use super::{data, Args, ToolResult};
use crate::{
    crypto,
    helpers::bad,
    keystore::{self, Vault},
    totp_store,
};

fn operate(action: &str, args: Args) -> ToolResult {
    let mut params = Value::Object(args.0);
    params["action"] = json!(action);
    crypto::crypto_op(&Vault::default(), params)
}

pub(super) fn cipher(mut args: Args) -> ToolResult {
    let algorithm = args.text("algorithm");
    let encrypting = args.text("op") == "encrypt";
    let action = if encrypting { "encrypt" } else { "decrypt" };
    if algorithm == "xor" {
        if args.text("plainEncoding") == "base64" {
            return Err(bad("XOR input encoding must be UTF-8 or hex"));
        }
        let input_hex = !encrypting || args.text("plainEncoding") == "hex";
        args.0.insert("inputHex".into(), json!(input_hex));
        return operate("xor", args);
    }
    if algorithm.starts_with("chacha")
        || algorithm.starts_with("xchacha")
        || matches!(
            algorithm,
            "aes-256-gcm-siv" | "aes-256-siv" | "aes-256-ccm" | "aes-256-ctr"
        )
    {
        if let Some(iv) = args.0.remove("iv") {
            args.0.insert("nonce".into(), iv);
        }
        let nonce_encoding = args.0["parameterEncoding"].clone();
        let (input, output) = if encrypting {
            ("plainEncoding", "cipherEncoding")
        } else {
            ("cipherEncoding", "plainEncoding")
        };
        args.0.insert("nonceEncoding".into(), nonce_encoding);
        args.0.insert("inputEncoding".into(), args.0[input].clone());
        args.0
            .insert("outputEncoding".into(), args.0[output].clone());
        return operate("modern-aead", args);
    }

    let separate = args.text("payloadFormat") == "separate";
    let mode = args.text("mode");
    if (!separate
        && ["iv", "tag", "aad"]
            .iter()
            .any(|name| args.0.contains_key(*name)))
        || (args.0.contains_key("aad") && !matches!(mode, "gcm" | "auto"))
        || (algorithm == "sm4" && args.0.contains_key("aad"))
    {
        return Err(bad(
            "IV and tag require separate format; AAD requires separate AES-GCM",
        ));
    }
    if !separate
        && (args.text("plainEncoding") != "utf8" || args.text("cipherEncoding") != "base64")
    {
        return Err(bad(
            "Use separate format to choose plaintext or ciphertext encoding",
        ));
    }
    if mode == "auto" {
        args.0.remove("mode");
    }
    operate(action, args)
}

pub(super) fn public_key_cipher(mut args: Args) -> ToolResult {
    let action = if args.text("algorithm") == "rsa" {
        "rsa"
    } else {
        "sm2"
    };
    let output = args.0["plainEncoding"].clone();
    if action == "sm2"
        && (args.text("cipherEncoding") != "base64"
            || (args.text("op") == "encrypt" && args.text("plainEncoding") != "utf8"))
    {
        return Err(bad("SM2 uses UTF-8 plaintext input and Base64 ciphertext"));
    }
    args.0.insert("outputEncoding".into(), output);
    operate(action, args)
}

pub(super) fn message_auth(mut args: Args) -> ToolResult {
    let algorithm = args.text("algorithm");
    if let Some(algorithm) = algorithm.strip_prefix("totp-") {
        if args.text("keyEncoding") != "base32" {
            return Err(bad("TOTP requires keyEncoding base32"));
        }
        let now = args
            .text("text")
            .parse::<u64>()
            .map_err(|_| bad("Expected an unsigned Unix timestamp in seconds"))?;
        let period = args.number("period");
        let mut entries = Vec::new();
        totp_store::save(
            &mut entries,
            &json!({
                "name": "temporary", "secret": args.text("keyMaterial"), "algorithm": algorithm,
                "period": period, "digits": args.number("digits")
            }),
        )?;
        let window = totp_store::windows(&entries[0], now)?;
        return Ok(
            json!({ "text": window["windows"][1]["code"], "remaining": window["remaining"],
            "counter": (now / period as u64).to_string() }),
        );
    }
    if algorithm.starts_with("hmac") {
        return operate("hmac", args);
    }
    args.0.insert("inputEncoding".into(), json!("utf8"));
    operate("specialized", args)
}

pub(super) fn key_derivation(args: Args) -> ToolResult {
    operate("kdf", args)
}

pub(super) fn digital_signature(args: Args) -> ToolResult {
    operate("signature", args)
}

pub(super) fn jwt_signature(args: Args) -> ToolResult {
    if args.text("op") == "sign" {
        jwt_object(args.text("text"), "payload")?;
        operate("jwt-sign", args)
    } else {
        let mut parts = args.text("text").trim().split('.');
        for part in ["header", "payload"] {
            let bytes = URL_SAFE_NO_PAD
                .decode(parts.next().unwrap_or_default())
                .map_err(|_| bad(format!("Invalid JWT {part}")))?;
            let source =
                std::str::from_utf8(&bytes).map_err(|_| bad(format!("Invalid JWT {part}")))?;
            jwt_object(source, part)?;
        }
        operate("jwt-verify", args)
    }
}

fn jwt_object(source: &str, part: &str) -> Result<(), dbx_plugin_sdk::PluginError> {
    if !data::read_json(source)?.get().starts_with('{') {
        return Err(bad(format!("JWT {part} must be a JSON object")));
    }
    data::require_unique_json(source)
}

pub(super) fn key_cipher(args: Args) -> ToolResult {
    if args.text("algorithm") == "aes-ff1" && args.text("text").len() > 1024 {
        return Err(bad("FF1 input exceeds 1,024 digits"));
    }
    operate("specialized", args)
}

pub(super) fn key_exchange(args: Args) -> ToolResult {
    operate("kem", args)
}

pub(super) fn key_generate(args: Args) -> ToolResult {
    let algorithm = args.text("algorithm");
    match algorithm {
        "rsa" => {
            let bits = args.number("bits");
            if !matches!(bits, 2048 | 3072) {
                return Err(bad("RSA key size must be 2048 or 3072 bits"));
            }
            let (public, private) = keystore::generate_rsa_pem(bits, "pkcs8")?;
            Ok(
                json!({"algorithm": "rsa-pem", "bits": bits, "saved": false, "publicKey": public, "privateKey": private}),
            )
        }
        "sm2" => {
            let (public, private) = keystore::generate_sm2_pair();
            Ok(
                json!({"algorithm": "sm2", "saved": false, "publicKey": public, "privateKey": private}),
            )
        }
        "hmac" => {
            let mut bytes = Zeroizing::new(vec![0; args.number("length")]);
            OsRng
                .try_fill_bytes(&mut bytes)
                .map_err(|_| bad("OS randomness unavailable"))?;
            Ok(json!({"algorithm": algorithm, "saved": false, "material": hex::encode(&*bytes)}))
        }
        _ => {
            let material = keystore::generate_material(algorithm, &Value::Null)?;
            Ok(json!({"algorithm": algorithm, "saved": false, "material": material}))
        }
    }
}
