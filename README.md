# ACS Switch

ACS Switch is the desktop configuration client for [ACS Gateway](https://acsgw.top). It is customized from [CC Switch](https://github.com/farion1231/cc-switch) for users who want to configure and switch coding harnesses without manually editing each tool's settings.

[Chinese documentation](README_ZH.md) | [Gateway setup guide](https://acsgw.top/config-guide) | [Latest release](https://github.com/lsy1770/acs-switch/releases/latest)

## Download

- Windows x64: [ACS Switch installer](https://github.com/lsy1770/acs-switch/releases/latest/download/ACS-Switch_3.19.2_x64-setup.exe)
- SHA-256: [checksum file](https://github.com/lsy1770/acs-switch/releases/latest/download/ACS-Switch_3.19.2_x64-setup.exe.sha256)

The current Windows installer is unsigned, so Windows SmartScreen may require manual confirmation.

## Supported tools

- Claude Code
- Codex
- Gemini CLI
- Grok Build
- OpenCode
- OpenClaw
- Hermes

All ACS-managed profiles use `https://acsgw.top` with the protocol endpoint required by each tool.

## Import flow

1. Create or select an active API key in ACS Gateway.
2. Choose **Import into ACS Switch**, then select tools and default models.
3. Confirm the import in ACS Switch and switch profiles from the desktop dashboard.

The import link contains a single-use token that expires after five minutes. This limit applies only to the import token, not to the API key. Imported API keys remain governed by their status and expiration settings in ACS Gateway.

## Development

Requirements: Node.js 20, pnpm, Rust 1.95, and the native dependencies required by Tauri 2.

```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm tauri build
```

## Upstream and license

ACS Switch is based on [farion1231/cc-switch](https://github.com/farion1231/cc-switch). The upstream copyright and MIT license are retained in [LICENSE](LICENSE).
