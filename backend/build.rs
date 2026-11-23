use std::{env, path::PathBuf, process::Command};

fn main() {
    let root =
        PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").expect("manifest directory")).join("..");
    let out = PathBuf::from(env::var_os("OUT_DIR").expect("Cargo output directory"))
        .join("mcp-utilities.js");
    for path in ["backend/js", "package.json", "package-lock.json"] {
        println!("cargo:rerun-if-changed={}", root.join(path).display());
    }
    let status = Command::new("node")
        .args(["backend/js/build.mjs"])
        .arg(out)
        .current_dir(&root)
        .status()
        .expect("Install Node.js 22 and run npm ci in the plugin root before building the sidecar");
    assert!(
        status.success(),
        "Failed to bundle MCP utilities. Run npm ci in the plugin root."
    );
}
