# Security Policy

[简体中文](SECURITY.md) | [English](SECURITY.en.md)

DBX Toolbox handles local files, cryptographic material, and process information. Please disclose potential vulnerabilities responsibly and do not publish exploitable details before a fix is available.

## Supported versions

| Version | Security updates |
| --- | --- |
| Latest released version | Supported |
| Earlier versions | Not guaranteed |

Before reporting a problem, verify that it is still reproducible on the latest release.

## Report a vulnerability privately

Use GitHub's [private vulnerability reporting](https://github.com/aiLi0617/dbx-plugin-toolbox/security/advisories/new) to submit a security issue.

Do not disclose the following through a public issue, discussion, pull request, or log attachment:

- Working keys, tokens, passwords, master passwords, or vault files
- Paths or techniques that allow arbitrary local file reads or overwrites
- Reproduction steps for unauthorized process termination
- Complete exploit code that bypasses sidecar identity, protocol, or message boundaries
- Public demonstrations or payloads for an unfixed vulnerability

Include as much of the following as possible:

- Affected plugin and DBX versions, operating system, and architecture
- Description, impact, and required preconditions
- Minimal reproduction steps or a proof of concept containing no real secrets
- Expected and actual behavior
- Sanitized logs, stack traces, or screenshots
- Suggested fixes or mitigations, if available

The maintainer will make a best effort to acknowledge the report, assess its impact, and coordinate remediation and disclosure. Before publishing details, allow reasonable time for investigation, release, and user upgrades.

## Security boundaries

- The plugin declares no network permission and processes ordinary tool data locally. The Rust sidecar still runs with the current user's permissions and is not an operating-system sandbox.
- The encrypted vault is a local protection mechanism, not a replacement for organizational key management, endpoint protection, access control, or backup policies.
- Importing, exporting, or opening a file explicitly selected by the user is expected behavior. Path escape, unconfirmed overwrite, or secret disclosure is not.
- Forcefully terminating a process may inherently lose unsaved data. Bypassing confirmation, identity revalidation, or protected-process rules is a security issue.

Use [GitHub Issues](https://github.com/aiLi0617/dbx-plugin-toolbox/issues) for regular bugs, feature requests, and hardening suggestions that contain no sensitive details.
