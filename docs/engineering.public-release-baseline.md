# Public Release Baseline

Audit date: 2026-03-07

## Current release signals

- `docker compose up -d --build` reaches a healthy full-stack baseline and serves:
  - `http://app.localhost`
  - `http://control.localhost`
  - `http://ops-control.localhost`
  - `http://api.localhost/health/live`
  - `http://control-api.localhost/health/live`
- Frontend unit suites currently pass for:
  - `frontend/dashboard`
  - `frontend/control-tenant`
  - `frontend/control-ops`
- `scripts/local/start.sh` reports readiness but the managed processes do not remain alive after the script exits.

## Confirmed blockers before public release

- Monitoring alert detail and event detail dialogs fail in-browser even though the backing APIs return `200`.
- Monitoring-to-console navigation currently exposes bearer tokens in query parameters.
- Checked-in local developer config and generated artifacts were present in the repo before this cleanup pass.
- `frontend/control-ops` Playwright coverage exists, but local execution fails until Playwright browser binaries are installed.

## Secret and privacy review snapshot

- Working-tree pattern scan found no live private keys or API secrets in tracked source files.
- Public-release history scanning is still required before publish.
- Personal path references and local machine config were present in tracked files before this cleanup pass and are being removed as part of the public-source preparation.
