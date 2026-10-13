# DBX Toolbox

[简体中文](README.md) | [English](README.en.md)

> A privacy-focused collection of local developer utilities with an encrypted key vault. Data conversion, text and image processing, encoding, and cryptographic operations all run locally.

DBX Toolbox is a Workbench plugin for [DBX](https://github.com/t8y2/dbx). It brings frequently used developer tools into one workspace and includes a local encrypted key vault backed by a Rust sidecar. The plugin declares no network permission and does not upload the content it processes.

| Item | Value |
| --- | --- |
| Plugin ID | `io.github.aili0617.toolbox` |
| Current version | `0.2.0` |
| Requirements | DBX `>= 0.5.68`, Host API `1` |
| Source and homepage | [aiLi0617/dbx-plugin-toolbox](https://github.com/aiLi0617/dbx-plugin-toolbox) |
| License | [Apache-2.0](LICENSE) |

## Contents

- [Highlights](#highlights)
- [Installation and usage](#installation-and-usage)
- [Feature overview](#feature-overview)
- [Privacy and security](#privacy-and-security)
- [Architecture](#architecture)
- [Local development](#local-development)
- [Packaging and release](#packaging-and-release)
- [Project structure](#project-structure)

## Highlights

- **Local first:** the Workbench declares no network permission. Data conversion, image processing, and cryptographic operations run locally.
- **Broad everyday coverage:** 64 tool entries across 9 categories, with search, favorites, recently used tools, and category filters.
- **Multilingual UI:** English, Simplified Chinese, Traditional Chinese, Spanish, Italian, Japanese, Portuguese, Korean, Turkish, and Azerbaijani, with live synchronization to the DBX host language.
- **Explicit limits and precision rules:** data conversion has a 5 MB input limit. Operations that may lose structure or numeric precision warn the user or refuse to run.
- **Keys stay in the sidecar:** the UI refers to vault entries by `keyId`, keeping plaintext keys out of UI persistence and Workbench context.
- **Desktop-oriented workflows:** local file import and export, QR and barcode generation and recognition, batch image processing, OCR, and spreadsheet editing.

## Installation and usage

### DBX Plugin Center

Open **Plugin Center** in DBX, search for **Toolbox**, install the plugin, and open **DBX Toolbox** from the Workbench.

### Local development packages

After packaging the project, open **Plugin Center → Settings → Third-party and developer options**, enable installation of unsigned development packages, and select the generated `.dbxp` file.

> Unsigned packages are intended only for local development and verification. Use the DBX Plugin Center as the source of truth for official releases and update notes.

### Usage notes

- Search on the home page can open a matching tool or sub-operation directly.
- Editors support Tab indentation and Shift+Tab outdent. Press Esc before Tab to move focus out of an editor.
- Ordinary tool inputs last only for the current Workbench session. Encryption, JWT, TOTP, password, and key-generation views clear sensitive inputs when you leave them.
- After saving a QR code, **Open containing folder** asks the system file manager to reveal the file.

## Feature overview

### Data and code

| Tool | Capabilities |
| --- | --- |
| JSON Workbench | Format, minify, validate, tree editing, JSONPath, and export to formats such as TypeScript and SQL |
| Data conversion | Convert between JSON, YAML, CSV, TSV, NDJSON, XML, and TOML |
| Code formatting | SQL, XML, YAML, HTML, CSS, JavaScript, and TypeScript |
| Spreadsheet | Open, edit, and export XLSX, CSV, TSV, and JSON; bulk paste, undo/redo, sheets, search, and filtering |
| JSON Schema | Draft 2020-12, local `$ref`, common formats, and structured error paths without loading remote schemas |
| `.env` tools | Convert `.env` and JSON; detect duplicate keys, invalid names, quoting, and multiline values without expanding variables |
| Chart generator | Create bar, line, area, and pie charts from local data and export SVG or PNG |

> XLSX import preserves cell values only. Formulas, styling, images, and merged cells are not retained.

### Encoding, conversion, and calculation

- **Encoding and escaping:** Base64, Base32, Base58, Hex, URL, HTML, Unicode, JavaScript, JSON, CSS, SQL strings, Data URI, Punycode/IDN, and Quoted-Printable.
- **Compression:** UTF-8 text and Gzip Base64 conversion; image Base64 encoding, decoding, preview, and save.
- **Time and color:** Unix timestamp conversion, time zones, date arithmetic, HEX/RGB(A)/HSL(A)/HSV/CMYK conversion, color wheel, screen color picker, and WCAG contrast checks and fixes.
- **Developer calculations:** visual Cron builder and run preview, base 2–36 conversion, phone-number parsing, bandwidth and transfer-time estimates, IPv4/IPv6 CIDR calculations, and bounded subnet splitting.
- **Developer references:** SemVer parsing and ranges, chmod conversion, offline HTTP status lookup, User-Agent parsing, device information, and keyboard event inspection.
- **Port processes on Windows, macOS, and Linux:** inspect a local TCP or UDP port, show its process identity, and independently recommend five available ports verified by real socket binding. Termination requires confirmation and revalidates process start time and port ownership. Unix inspection requires `lsof`; safe Linux termination uses `pidfd` and requires kernel 5.3 or newer.

### Text and content

- Whitespace and line processing, deduplication and sorting, naming-style conversion, statistics, and masking.
- Regular-expression testing, text diff, Markdown preview, and Unicode code-point inspection.
- UUID, ULID, NanoID, random password, and random byte generation.
- Repeatable placeholder text, synthetic data, and promotional copy generation.

### Developer helpers

- Convert cURL and HTTP requests to JavaScript, Python, Java, Rust, Go, and other client code.
- Convert Docker Run and Compose in both directions, plus a searchable Git command reference.
- Generate Web Meta/Open Graph markup and run HTML, CSS, and JavaScript in an isolated playground.

### Images and machine-readable codes

| Tool | Capabilities |
| --- | --- |
| QR and barcodes | Generate QR codes and barcodes as PNG or SVG; recognize QR, Data Matrix, and PDF417 locally in batches; Han Xin Code generation only |
| Image processing | Crop, resize, rotate, flip, and watermark up to 20 local images; export PNG, JPEG, or WebP |
| Image utilities | Compression, format conversion, grid slicing, pixelation, and image/Base64 conversion |
| Stitching and GIF | Stitch images horizontally or vertically and create GIF animations from local image sequences |
| Image OCR | OCR code ships with the plugin. Fast and accurate models are downloaded from a pinned GitHub Release only after an explicit click and are verified before use. Recognition is fully offline after installation; images are never sent to a network service. |
| Placeholder images | Generate placeholders with specified pixel dimensions and target file sizes |

### Security and cryptography

| Tool | Capabilities |
| --- | --- |
| Hash and HMAC | MD5, SHA, SM3, CRC32, and HMAC-SHA-1/SHA-256/SHA-384/SHA-512/SM3 for text or files |
| JWT | Decode, issue, and verify HS, RS, and PS algorithm families |
| Symmetric encryption | AES-128/192/256 (GCM, CBC, ECB) and SM4 (CBC, ECB), with separate IV/nonce/tag, AAD, and UTF-8/Hex/Base64 interoperability |
| Asymmetric encryption | RSA OAEP-SHA1/256/384/512 or PKCS#1 v1.5 and SM2; RSA plaintext, ciphertext, and decrypted output support UTF-8, Hex, or Base64 |
| Modern authenticated encryption | ChaCha20-Poly1305, XChaCha20-Poly1305, AES-256-GCM-SIV, AES-256-CCM, plus AES-256-CTR for interoperability |
| Key derivation | Argon2id, scrypt, PBKDF2-HMAC-SHA256, and HKDF-SHA256 with configurable salt and cost parameters |
| Digital signatures | RSA-PSS-SHA256, RSA-PKCS#1-SHA256, and SM2-SM3 signing and verification |
| Keys and certificates | Generate AES, SM4, HMAC, RSA, and SM2 key material; inspect X.509, SSH public keys, JWK, and JWKS |
| Other | TOTP and an XOR utility intended only for debugging and comparison |

### Encrypted key vault

The sidecar stores the vault in the plugin-specific data directory. Key material is protected with **Argon2id + AES-GCM**. The UI displays only names, algorithms, and fingerprints. AES (128/192/256-bit), SM4, and HMAC operations can use either a vault entry or one-time key input; when a vault entry is selected, the UI sends only its `keyId` to the sidecar.

The official host supplies a `DBX_PLUGIN_DATA_DIR` ending in `plugin-data/<id>`. Custom environments are namespaced with `io.github.aili0617.toolbox`:

```text
plugin-data/
└── io.github.aili0617.toolbox/
    ├── prefs.json
    ├── prefs.json.bak
    ├── keystore
    └── keystore.bak
```

- Preference and vault files are backed up separately.
- The directory is created on first access. A missing, empty, or relative environment path produces an explicit error instead of falling back to a global user directory.
- Existing data is copied from the legacy per-user location on first access. Migration never decrypts, deletes, or edits the old vault and remains retryable after an interrupted or failed attempt.
- Exit an older DBX version before upgrading so an old sidecar cannot modify files during migration. Keep the original master password.
- This data-directory convention is not an operating-system sandbox. Files explicitly exported by the user are written to the selected destination.

## Privacy and security

- The plugin declares no network permission and does not initiate network connections. `host.binary` transfers binary file data between the UI and local Rust sidecar; `host.events` handles host events.
- Sensitive operations run in the local sidecar. Plaintext keys are not written to `localStorage`, Workbench context, or logs.
- Cryptographic views clear inputs when you leave them, reducing screen-sharing and session-residue risks.
- The key vault is a local protection mechanism, not a replacement for organizational key management, backup, or audit policies. Protect the master password and do not use production secrets in untrusted environments.

## Architecture

```text
┌─────────────────────┐     Host API      ┌──────────────────┐
│ UI (Svelte + Vite)  │ ◄───────────────► │ DBX host         │
│ src/ → ui/          │                   └────────┬─────────┘
└─────────────────────┘                            │ stdin/stdout
                                                   │ JSON-RPC
                                          ┌────────▼─────────┐
                                          │ Rust sidecar     │
                                          │ crypto / vault   │
                                          │ prefs / fsutil   │
                                          └──────────────────┘
```

- **Frontend:** Svelte 5 and Vite under `src/`; generated assets are written to ignored `ui/` output.
- **Backend:** Rust sidecar under `backend/`, packaged as `bin/dbx-plugin-toolbox`.
- **Contribution:** one Workbench entry with `host.binary` and `host.events`; no runtime network permission.
- **Sidecar API:** JSON, hash, cryptography, certificates, OCR, keys, preferences, ports, and local-file operations.

## Local development

### Requirements

- Node.js 22+
- Rust 1.89 or newer
- DBX Plugin CLI (`dbx-plugin`)

### Install, test, and debug

```bash
npm install
npm test          # Node.js built-in test runner
npm run build     # Vite output to ui/
npm run check     # i18n check + tests + build

# Start the DBX plugin development host with live reload
dbx-plugin dev --path . --port 5190
```

A successful watch build prints `DBX_UI_BUILD_SUCCESS` on its own line and triggers reload. Never commit key material or include it in a `.dbxp` package.

### Windows note

If `dbx-plugin package` fails with `os error 216`, place the active Rust toolchain's `bin` directory before the rustup `cargo.exe` shim in `PATH`, for example:

```text
%USERPROFILE%\.rustup\toolchains\stable-x86_64-pc-windows-msvc\bin
```

DBX debug commands may normalize the working directory to a `\\?\D:\...` path. The project therefore uses Node.js in `dbx-plugin.toml` to return to a regular drive path before starting Vite. Do not replace that command with a plain `npm.cmd` invocation.

## Packaging and release

Build an unsigned candidate package from a clean dependency installation:

```bash
npm ci
npm run build
dbx-plugin package .
```

Artifacts are written under `dist/` as `<id>-<version>-<target>.dbxp` with a matching `.artifact.json`. The generated `ui/` directory does not need to be committed.

This repository contains plugin source only. Store publication is handled through [t8y2/dbx-store](https://github.com/t8y2/dbx-store). Publishing a GitHub Release triggers [`.github/workflows/plugin-release.yml`](.github/workflows/plugin-release.yml).

For versioning, candidate packages, `releaseNotes`, and store operations, see the [release notes and publishing guide](docs/release-notes-ops.md) (Chinese).

## Project structure

```text
├── assets/              # Icons and static assets
├── backend/             # Rust sidecar and key-vault implementation
├── docs/                # Release and project documentation
├── shared/              # Local SDK aligned with the plugin CLI
├── src/                 # Svelte UI source
├── tests/               # Frontend unit tests
├── manifest.json        # Runtime manifest and permission contract
├── dbx-plugin.toml      # Packaging and development build configuration
└── package.json         # Frontend dependencies and scripts
```

## Contributing

Regular bug reports and suggestions are welcome through [GitHub Issues](https://github.com/aiLi0617/dbx-plugin-toolbox/issues). Read the [contribution guide](CONTRIBUTING.en.md) before preparing a code change.

Do not open a public issue for a potential vulnerability involving keys, credentials, arbitrary file access, process termination, or another security impact. Follow the [security policy](SECURITY.en.md) to report it privately.

## License

Released under the [Apache License 2.0](LICENSE).
