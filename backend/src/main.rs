mod crypto;
mod fsutil;
mod helpers;
mod keystore;
mod prefs;

use std::sync::Mutex;

use dbx_plugin_sdk::{
    PluginEmitter, PluginError, PluginHandler, PluginMetadata, PluginServer, RequestContext,
};
use serde_json::Value;

use crate::keystore::Vault;

#[derive(Default)]
struct Plugin {
    vault: Mutex<Vault>,
}

impl PluginHandler for Plugin {
    fn handle(
        &self,
        _context: RequestContext,
        method: &str,
        params: Value,
        _emitter: &PluginEmitter,
    ) -> Result<Value, PluginError> {
        if method.starts_with("toolbox/keys/") {
            let mut vault = self
                .vault
                .lock()
                .map_err(|_| PluginError::new(-32000, "Vault lock is poisoned"))?;
            return vault.handle(method, params);
        }
        if method.starts_with("toolbox/prefs/") {
            return prefs::handle(method, params);
        }
        if method == "toolbox/save-file"
            || method == "toolbox/reveal-file"
            || method == "toolbox/copy-image"
        {
            return fsutil::handle(method, params);
        }
        match method {
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
}

fn main() -> std::io::Result<()> {
    let metadata = PluginMetadata::new("io.github.aili0617.toolbox", env!("CARGO_PKG_VERSION"));
    PluginServer::new(metadata, Plugin::default()).serve()
}
