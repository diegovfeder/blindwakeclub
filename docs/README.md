# Blind Wake Club Docs

This folder is the operational source of truth for the waiver app.

## Read Order

1. `PROJECT_STATE.md`
2. `SUPABASE_SETUP.md`
3. `ADMIN_AUTH_FLOW.md`
4. `WAIVER_LEGAL_TEXT_PT_BR.md`
5. `WAIVER_PDF_AND_DELIVERY_PLAN.md`
6. `QR_CODE.md`

## Who This Is For

- Product/operator owners who need to launch and run the app.
- Engineers who need to change behavior safely.
- AI coding agents that need current architecture and guardrails.

## Documentation Rules

- Update `PROJECT_STATE.md` whenever routes, APIs, storage, or auth model changes.
- Update `SUPABASE_SETUP.md` whenever Supabase env vars or setup flow changes.
- Keep `WAIVER_LEGAL_TEXT_PT_BR.md` as canonical waiver copy with explicit versioning.
- Keep examples production-safe. Do not include real secrets in docs.
