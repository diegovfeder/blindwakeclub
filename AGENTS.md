# AGENTS.md

## Purpose
Operational handoff and execution guide for the Blind Wake Club waiver app.

## State Snapshot (as of 2026-02-14)

- Git:
  - Repository is already initialized (`.git` exists).
  - Active branch: `main`.
  - Remote configured: `origin https://github.com/diegovfeder/blindwakeclub.git`.
- Build health:
  - `npm run build` passes on Next.js `16.0.0`.
- Stack:
  - Next.js App Router + TypeScript + React 19.
  - Node runtime routes for uploads/submissions/admin APIs.
- Storage:
  - Local filesystem under `data/` (`submissions.json`, `photos/`, `signatures/`).

## Architecture (Current)

### UI routes
- `/` Home page with links to waiver and admin.
- `/waiver` Participant waiver form.
- `/waiver/success/[id]` Submission confirmation.
- `/admin/submissions?token=...` Token-gated admin table + CSV link.

### API routes
- `POST /api/uploads/presign`
  - Validates mime/size and returns short-lived signed upload URL.
- `PUT /api/uploads`
  - Verifies signature + constraints and writes file to `data/photos/`.
- `POST /api/submissions`
  - Validates waiver payload, decodes signature PNG, verifies optional photo key,
    computes tamper hash, stores record in `data/submissions.json`.
- `GET /api/admin/submissions`
  - Token-auth JSON export.
- `GET /api/admin/submissions.csv`
  - Token-auth CSV export.

### Cross-cutting controls
- Middleware enforces HTTPS for production non-localhost traffic.
- Upload/signature/payload size limits.
- MIME allowlist for uploads.
- Timing-safe token/signature comparisons.
- Tamper-evidence hash stored per submission.

## Data Flow

1. Client fills `/waiver` form and signs on canvas.
2. Optional photo upload:
   - client asks `/api/uploads/presign` for signed URL,
   - client uploads binary to `/api/uploads`.
3. Client submits waiver payload + `signatureDataUrl` + optional `photoKey` to `/api/submissions`.
4. Server writes signature file, appends record, returns `submissionId`.
5. Client redirects to `/waiver/success/[id]`.
6. Admin views/exports records via token-gated page/API.

## Documentation Reality Check

- Current repo docs present:
  - `README.md`
  - `docs/QR_CODE.md`
  - `assets/README.md`
- `assets/README.md` is stale relative to this codebase:
  - references Jotform process and docs that are not in this repo (`docs/jotform-setup.md`, `docs/form-launch-runbook.md`).
  - should be updated or removed to avoid operator confusion.

## Known Gaps / Risks

1. Local file storage is not durable/scalable for multi-instance production.
2. `UPLOAD_SIGNING_SECRET` has a weak fallback (`change-me-in-production`) if env is missing.
3. Admin token can be passed via query parameter; this can leak via logs/history.
4. No role-based auth, no rate limiting, no audit log.
5. No automated tests (unit/integration/e2e) or CI checks in repo.
6. No explicit backup/restore script for `data/`.
7. No malware/content scanning for uploaded images.

## Next Steps (Priority)

### P0 (before operational launch)
1. Set strong secrets in `.env.local` (`ADMIN_TOKEN`, `UPLOAD_SIGNING_SECRET`, `NEXT_PUBLIC_FORM_URL`).
2. Remove query-param token usage in admin UI and use auth header/session approach.
3. Decide production storage stack (object storage + DB) and migrate off local filesystem.
4. Reconcile docs:
   - align `assets/README.md` with Next.js app flow,
   - remove Jotform references unless intentionally supporting a Jotform path.

### P1 (hardening)
1. Add request rate limiting on upload/submission/admin endpoints.
2. Add server-side file signature checks (magic bytes) for uploaded images.
3. Add structured logs and minimal audit trail for admin exports.
4. Add retention cleanup job for old records if policy requires it.

### P2 (quality + operations)
1. Add test coverage:
   - payload validation,
   - upload token verification,
   - submissions write/read,
   - admin auth handling.
2. Add CI pipeline for `npm run build` + tests.
3. Add deployment runbook and incident-recovery notes.

## Ready-to-Work Checklist

- [ ] Confirm product direction: custom Next.js form vs Jotform-runbook workflow.
- [ ] Finalize docs to match chosen direction.
- [ ] Configure production env secrets.
- [ ] Implement P0 security/storage changes.
- [ ] Add tests + CI.
- [ ] Perform end-to-end mobile testing (iOS/Android signature + photo upload + admin visibility).

## Git Notes

- Git is already started; no initialization needed.
- To capture this baseline state:
  1. `git add AGENTS.md`
  2. `git add <other intended files>`
  3. `git commit -m "Add architecture state and execution plan"`
  4. `git push origin main` (or open PR from a `codex/...` branch)
