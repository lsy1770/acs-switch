# ACS Switch customization

ACS Switch is a thin customization of CC Switch for ACS Gateway users.

## Product invariants

- Gateway origin: `https://acsgw.top`
- Claude Code base URL: `https://acsgw.top/claude`
- Codex base URL: `https://acsgw.top/openai`
- Gemini CLI base URL: `https://acsgw.top/gemini`
- Desktop deep-link scheme: `acsswitch://`
- API keys remain scoped by the ACS Gateway account and provider-group bindings.
- A model or group switch selects a server-authorized profile. It never sends an arbitrary group override header.

## Upstream workflow

The `upstream` remote tracks `https://github.com/farion1231/cc-switch.git`. Keep ACS-specific changes small and rebase them onto reviewed upstream releases.

The upstream updater is disabled until ACS owns a release feed and signing key. Do not point this build at upstream CC Switch binaries because an update would replace the customization.

## Site-to-desktop contract

The site issues a five-minute, single-use provisioning token. ACS Switch exchanges it only with the fixed HTTPS endpoint, validates the profile origin and harness endpoints, then imports and activates each selected provider profile. API key plaintext is encrypted at rest while the token exists, never appears in the browser URL, and is removed from Redis by the atomic exchange.

The local `.cc-switch` data path and storage keys remain unchanged for upstream migration compatibility. They are implementation identifiers, not product branding.
