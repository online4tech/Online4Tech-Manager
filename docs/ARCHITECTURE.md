# Architecture

Browser UI (GitHub Pages) → local Bridge on 127.0.0.1 → receiver over LAN/SSH.

GitHub Pages is static hosting and must never receive receiver passwords. The Bridge is the trust boundary:
- loopback bind only
- strict Origin allowlist
- explicit authentication / pairing
- allowlisted typed actions (not arbitrary shell)
- input validation and timeouts
- audit log without secrets
- confirmation for disruptive actions

The current UI is intentionally a non-operational scaffold until the existing Bridge implementation and API are inspected.