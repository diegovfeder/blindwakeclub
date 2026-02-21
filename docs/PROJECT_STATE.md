# Project State

Last updated: 2026-02-21

## Product Goal

Collect legally relevant waiver acknowledgements from riders before sessions:

- Required identity/contact details.
- Required risk/medical/privacy consents.
- Signature captured from canvas as PNG.
- Optional photo upload.
- Admin review/export for operations and incident response.

## Current Stack

- Next.js 16 App Router
- TypeScript + React 19
- Node runtime for submission/upload/admin APIs

## Routes

- `GET /`: waiver form
- `GET /admin`: admin panel (cookie-authenticated session)
- `POST /api/uploads/presign`: returns short-lived signed upload URL
- `PUT /api/uploads`: validates signature/mime/size and stores optional photo
- `POST /api/submissions`: validates payload, stores signature, appends submission record
- `GET /api/admin/submissions`: token-protected JSON export
- `GET /api/admin/submissions.csv`: token-protected CSV export
- `POST /api/admin/session`: validates admin token and sets session cookie
- `POST /api/admin/logout`: clears session cookie

## Storage Modes

Configured by `STORAGE_BACKEND`.

- `local`:
  - `data/submissions.json`
  - `data/photos/*`
  - `data/signatures/*`
- `google`:
  - Google Sheets stores metadata rows
  - Google Drive stores photos and signatures

## Data Model (Submission Record)

- `id`
- `createdAt`
- `payload` (all form fields except signature binary)
- `signature.key` (local path or Google Drive file id)
- `signature.sha256`
- `tamperHash` (sha256 over normalized payload + createdAt)

## Security Controls In Place

- HTTPS enforcement in production middleware (non-localhost).
- Upload and submission payload limits.
- MIME allowlist checks for photo uploads.
- Signed upload token verification for `PUT /api/uploads`.
- Timing-safe token/signature comparisons.
- Admin panel no longer uses query-string token.
- Cookie session is `httpOnly`, `sameSite=lax`, and `secure` in production.

## Known Gaps / Risks

1. No rate limiting on upload/submission/admin APIs.
2. No server-side magic-byte validation for uploaded images.
3. No malware scanning for uploaded files.
4. No full automated test suite or CI enforcement yet.
5. Admin cookie currently stores raw admin token value.
6. No structured audit log for admin reads/exports.
7. No formal retention cleanup worker yet.

## Next Steps

### P0 (launch hardening)

1. Replace raw admin-token cookie with signed session token.
2. Add rate limiting per IP on upload/submission/admin endpoints.
3. Add magic-byte file type validation for image uploads.
4. Configure production secrets in Vercel and verify Google backend.

### P1 (quality and operations)

1. Add integration tests for upload, submission, and admin auth.
2. Add CI for `npm run build` + tests.
3. Add structured logs and minimal admin audit events.
4. Define retention deletion workflow and recovery runbook.

### P2 (product polish)

1. Improve admin UI filtering/search.
2. Add media preview links for photo/signature in admin.
3. Add operator analytics summary (daily/weekly totals).

## AI Agent Notes

If you are an AI agent working in this repo:

1. Read this file first, then `GOOGLE_STORAGE_SETUP.md`.
2. Preserve API contracts used by `/src/components/waiver-form.tsx`.
3. Do not reintroduce admin query-string token auth.
4. Treat storage backend as switchable (`local` and `google`).
5. Run `npm run build` before finalizing changes.
