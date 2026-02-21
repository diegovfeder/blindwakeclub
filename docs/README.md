# Blind Wake Club Docs

This folder is the operational source of truth for the waiver app.

## Read Order

1. `PROJECT_STATE.md`
2. `GOOGLE_STORAGE_SETUP.md`
3. `ADMIN_AUTH_FLOW.md`
4. `QR_CODE.md`

## Who This Is For

- Product/operator owners who need to launch and run the app.
- Engineers who need to change behavior safely.
- AI coding agents that need current architecture and guardrails.

## Documentation Rules

- Update `PROJECT_STATE.md` whenever routes, APIs, storage, or auth model changes.
- Update `GOOGLE_STORAGE_SETUP.md` whenever env vars or cloud setup changes.
- Keep examples production-safe. Do not include real secrets in docs.
