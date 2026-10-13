use std::{env, fs, path::PathBuf};

const OCR_MODELS: [&str; 3] = [
    "models/detection-ppocrv5.rten",
    "models/recognition-mobile-opset13.rten",
    "models/recognition-server-opset13.rten",
];

fn main() {
    let manifest_dir = PathBuf::from(
        env::var_os("CARGO_MANIFEST_DIR").expect("Cargo should set CARGO_MANIFEST_DIR"),
    );

    for relative_path in OCR_MODELS {
        println!("cargo:rerun-if-changed={relative_path}");
        let path = manifest_dir.join(relative_path);
        let bytes = fs::read(&path)
            .unwrap_or_else(|error| panic!("Could not read OCR model {}: {error}", path.display()));

        if !bytes.starts_with(b"RTEN") {
            panic!(
                "OCR model {} is not a hydrated RTEN file. Run `git lfs pull` before building.",
                path.display()
            );
        }
    }
}
