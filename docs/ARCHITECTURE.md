# Architecture

`GitHub Pages UI → Windows local Bridge (127.0.0.1:8765) → SSH over LAN → Enigma2 receiver`

## Current API
- `GET /health`: bridge health and version.
- `POST /run`: allowlisted read/diagnostic operations such as `info`, `space`, and `services`.
- `POST /download-backup`: create and download a backup of supported Enigma2/Tuxbox configuration paths.

## Trust boundaries
- GitHub Pages is static hosting and must never receive receiver passwords.
- The Bridge binds to loopback and validates private-network receiver addresses.
- The Bridge checks the expected browser Origin. CORS is not authentication and does not by itself prevent every local-web threat.
- SSH host keys must be verified; do not automatically trust unknown host fingerprints.
- Keep credentials in memory only; never log or persist passwords.
- Expose typed, allowlisted operations only. Do not accept arbitrary shell commands from the browser.
- Any future write/configuration operation must require explicit confirmation, create a recoverable backup where practical, and report exactly what changed.

## Compatibility
The UI extracts standard Enigma2 image metadata (brand, machine name, image version, build and distro) rather than hard-coding one receiver model. Actual compatibility still depends on the receiver image exposing those fields and supporting the Bridge's allowlisted commands.

## Next hardening steps
1. Add local pairing with a short-lived token and CSRF protection.
2. Add operation timeouts and bounded output sizes.
3. Add tests against representative Vu+ and Dreambox image outputs.
4. Add a safe restore workflow before introducing configuration-changing actions.
