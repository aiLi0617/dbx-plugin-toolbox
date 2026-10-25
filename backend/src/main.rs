mod crypto;
mod cipher_defaults;
mod data_dir;
mod fsutil;
mod helpers;
mod keystore;
mod ocr;
mod ocr_alphabet;
mod ocr_models;
mod pdf;
mod ports;
mod prefs;
mod totp_store;

use std::sync::Mutex;

use dbx_plugin_sdk::{
    PluginEmitter, PluginError, PluginHandler, PluginMetadata, PluginServer, PluginTransport,
    RequestContext,
};
use serde_json::Value;

use crate::keystore::Vault;

#[derive(Default)]
struct Plugin {
    vault: Mutex<Vault>,
    hash_sessions: Mutex<crypto::HashSessions>,
    save_sessions: Mutex<fsutil::SaveSessions>,
    ocr: ocr::OcrService,
    pdf: pdf::PdfService,
}

impl PluginHandler for Plugin {
    fn handle(
        &self,
        _context: RequestContext,
        method: &str,
        params: Value,
        emitter: &PluginEmitter,
    ) -> Result<Value, PluginError> {
        if method.starts_with("toolbox/keys/") || method.starts_with("toolbox/totp/") {
            let mut vault = self
                .vault
                .lock()
                .map_err(|_| PluginError::new(-32000, "Vault lock is poisoned"))?;
            return vault.handle(method, params);
        }
        if method.starts_with("toolbox/prefs/") {
            return prefs::handle(method, params);
        }
        if method.starts_with("toolbox/cipher-defaults/") {
            return cipher_defaults::handle(method, params);
        }
        if method.starts_with("toolbox/hash-stream/") {
            let mut sessions = self
                .hash_sessions
                .lock()
                .map_err(|_| PluginError::new(-32000, "Hash session lock is poisoned"))?;
            return crypto::hash_stream_op(&mut sessions, method, params);
        }
        if method.starts_with("toolbox/ocr/") {
            return self.ocr.handle(method, params, emitter);
        }
        if method.starts_with("toolbox/pdf/") {
            return self.pdf.handle(method, params);
        }
        if method == "toolbox/save-file"
            || method.starts_with("toolbox/save-file-stream/")
            || method == "toolbox/reveal-file"
            || method == "toolbox/copy-image"
        {
            let mut sessions = self
                .save_sessions
                .lock()
                .map_err(|_| PluginError::new(-32000, "Save session lock is poisoned"))?;
            return fsutil::handle(&mut sessions, method, params);
        }
        match method {
            "toolbox/ports/list" | "toolbox/ports/kill" | "toolbox/ports/recommend" => {
                ports::handle(method, params)
            }
            "toolbox/json" => crypto::json_op(params),
            "toolbox/hash" => crypto::hash_op(params),
            "toolbox/crypto" => {
                let vault = self
                    .vault
                    .lock()
                    .map_err(|_| PluginError::new(-32000, "Vault lock is poisoned"))?;
                crypto::crypto_op(&vault, params)
            }
            "toolbox/cert" => crypto::cert_op(params),
            _ => Err(PluginError::method_not_found(method)),
        }
    }

    fn handle_binary(
        &self,
        channel: &str,
        data: Vec<u8>,
        _emitter: &PluginEmitter,
    ) -> Result<(), PluginError> {
        if channel.starts_with("toolbox/pdf/") {
            self.pdf.handle_binary(channel, data)
        } else {
            self.ocr.handle_binary(channel, data)
        }
    }
}

fn main() -> std::io::Result<()> {
    let metadata = PluginMetadata::new("io.github.aili0617.toolbox", env!("CARGO_PKG_VERSION"));
    PluginServer::new(metadata, Plugin::default())
        .transport(PluginTransport::Framed)
        .serve()
}
