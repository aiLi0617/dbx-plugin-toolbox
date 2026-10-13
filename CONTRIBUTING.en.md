# Contributing

[简体中文](CONTRIBUTING.md) | [English](CONTRIBUTING.en.md)

Thank you for contributing to DBX Toolbox. Use [GitHub Issues](https://github.com/aiLi0617/dbx-plugin-toolbox/issues) for regular bugs, feature proposals, and documentation problems.

Do not open a public issue for a potential vulnerability involving keys, credentials, arbitrary file access, process termination, or another security impact. Use the private channel described in the [security policy](SECURITY.en.md).

## Before you start

- Search existing issues and pull requests to avoid duplicate work.
- Keep each pull request focused on one topic and avoid unrelated formatting or refactoring.
- Discuss large features or compatibility changes in an issue before implementation.
- Never commit real keys, tokens, passwords, vaults, user files, or content from `.dbx-dev/`.

## Development environment

- Node.js 22+
- Rust 1.89+
- DBX Plugin CLI (`dbx-plugin`)

Install dependencies and run the baseline checks:

```bash
npm ci
npm run check
cargo test --manifest-path backend/Cargo.toml --locked
```

Start the project in the DBX plugin development host:

```bash
dbx-plugin dev --path . --port 5190
```

## Change requirements

### Frontend and interaction

- Follow the existing organization of Svelte components and shared utilities.
- Use theme tokens injected by DBX; do not hard-code brand, foreground, or background colors.
- Give interactive controls keyboard support, visible focus, and accessible names.
- Preserve explicit size and count limits for file, image, text, and binary input.

### Localization

- Update every supported locale when adding or changing user-visible text, not only Chinese and English.
- Keep placeholder names and counts consistent across locales.
- Run:

```bash
npm run i18n:sync
npm run i18n:check
```

### Rust sidecar and security

- Transfer only the minimum data required between the UI and sidecar.
- Refer to vault entries by `keyId`. Never write plaintext keys to `localStorage`, Workbench context, events, or logs.
- Validate targets before file access, process termination, or another high-risk operation. Preserve existing size, path, and identity checks.
- Do not modify or commit `.dbx-dev/`; it may contain local runtime data and plaintext credentials.

### Manifest and packaging

- Use only Manifest v1 fields in `manifest.json` and keep permissions minimal.
- When adding runtime assets, ensure `[package].include` in `dbx-plugin.toml` covers them.
- Do not commit `dist/`, `.dbxp` packages, `ui/assets/`, `backend/target/`, or other reproducible build output.
- Do not add signing metadata yourself or reuse a published version number.

## Testing

Add or update tests according to the scope of the change:

- UI, tool logic, and translations: `npm run check`
- Rust sidecar: `cargo test --manifest-path backend/Cargo.toml --locked`
- Manifest, permission, or package changes: run the DBX Plugin CLI project checks and package validation
- Platform-specific behavior: state which Windows, macOS, or Linux environments were tested and which remain unverified

Documentation-only changes should at least verify Markdown links and example commands.

## Commits and pull requests

Prefer concise Conventional Commit-style messages, for example:

```text
feat: add a new local utility
fix: validate port ownership before termination
docs: update contribution guide
```

A pull request description should include:

- Purpose and user-visible changes
- Main implementation approach
- Tests run and their results
- Security, privacy, and compatibility impact
- Screenshots or recordings for UI changes, when applicable
- Known limitations or follow-up work

By submitting a pull request, you agree to license your contribution under the repository's [Apache License 2.0](LICENSE).
