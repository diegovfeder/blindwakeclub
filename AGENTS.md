# AGENTS.md

## Purpose
Operational handoff and execution guide for the Blind Wake Club waiver app.

## State Snapshot (as of 2026-02-24)

- Git:
  - Repository initialized (`.git` exists).
  - Default branch: `main`.
  - Remote: `origin https://github.com/diegovfeder/blindwakeclub.git`.
- Build health:
  - `npm run build` passes on Next.js `16.1.6`.
- Stack:
  - Next.js App Router + TypeScript + React 19.
  - Node runtime for uploads/submissions/admin APIs.
- Storage:
  - `local` filesystem mode for fallback.
  - `supabase` mode for production metadata/files.
  - Google backend removed from runtime code.

## Architecture (Current)

### UI routes
- `/` waiver form and post-submit success state.
- `/admin` token-authenticated admin dashboard.

### API routes
- `POST /api/uploads/presign`
  - Validates mime/size and returns short-lived signed upload URL.
- `PUT /api/uploads`
  - Verifies signature + constraints and writes optional photo file.
- `POST /api/submissions`
  - Validates waiver payload, decodes signature PNG, verifies optional photo key,
    computes tamper hash, stores record, generates waiver PDF with embedded signature image.
- `GET /api/submissions/[id]/pdf`
  - Participant signed-link download or admin-auth download.
- `GET /api/admin/submissions`
  - Admin-auth JSON export.
- `GET /api/admin/submissions.csv`
  - Admin-auth CSV export.
- `POST /api/admin/session`
  - Validates admin token and sets `httpOnly` admin cookie.
- `POST /api/admin/logout`
  - Clears admin cookie.

### Cross-cutting controls
- Middleware enforces HTTPS for production non-localhost traffic.
- Upload/signature/payload size limits.
- MIME allowlist for uploads.
- Timing-safe token/signature comparisons.
- Tamper-evidence hash stored per submission.

## Data Flow

1. Client fills `/` form and signs on canvas.
2. Optional photo upload:
   - client asks `/api/uploads/presign` for signed URL,
   - client uploads binary to `/api/uploads`.
3. Client submits payload + `signatureDataUrl` + optional `photoKey` to `/api/submissions`.
4. Server stores signature, stores metadata row, stores generated PDF.
5. Client sees success state and can download signed PDF URL.
6. Admin views/searches exports in `/admin`.

## Storage Modes

### `local`
- Metadata: `data/submissions.json`
- Files:
  - `data/photos/*`
  - `data/signatures/*`
  - `data/pdfs/*`

### `supabase`
- Metadata: Postgres table (default `public.submissions`)
- Files: Supabase Storage bucket (default `waiver-files`)
  - `photos/*`
  - `signatures/*`
  - `pdfs/*`

## Known Gaps / Risks

1. No rate limiting on upload/submission/admin endpoints.
2. No server-side magic-byte validation for uploaded images.
3. No malware/content scanning for uploaded files.
4. No full automated test suite or CI enforcement yet.
5. Admin cookie currently stores raw admin token value.
6. No structured audit log for admin reads/exports.
7. No formal retention cleanup worker yet.

## Next Steps (Priority)

### P0 (before operational launch)
1. Rotate strong secrets (`ADMIN_TOKEN`, `UPLOAD_SIGNING_SECRET`).
2. Confirm Supabase table/bucket exists in production env.
3. Run end-to-end test on deployed Vercel URL (mobile + desktop).
4. Add basic per-IP rate limiting to upload/submission/admin routes.

### P1 (hardening)
1. Add magic-byte validation for uploaded images.
2. Add structured audit events for admin reads/exports.
3. Replace raw admin cookie with signed session payload.

### P2 (quality + operations)
1. Add integration tests for upload, submission, PDF download, and admin auth.
2. Add CI (`npm run build` + tests).
3. Add retention/cleanup job and recovery runbook.

## Ready-to-Work Checklist

- [ ] Confirm `STORAGE_BACKEND=supabase` in target environment.
- [ ] Confirm `SUPABASE_URL` and server key env vars are set.
- [ ] Confirm storage bucket and submissions table exist.
- [ ] Confirm admin login + CSV export works.
- [ ] Confirm submission with photo + signature succeeds on mobile.
- [ ] Confirm participant PDF download works post-submit.

## Git Notes

- Git is already started; no initialization needed.
- Use a branch for feature work and open PRs where possible.
