# Blind Wake Club Waiver App

Standalone Next.js App Router project for digital waiver intake.

Documentation index: `docs/README.md`

## What is implemented

1. `/` waiver form with:
   - required participant fields
   - full legal waiver text panel
   - required waiver version acceptance checkbox
   - canvas signature
   - optional photo upload
2. Secure upload flow:
   - `POST /api/uploads/presign`
   - `PUT /api/uploads`
3. Waiver submission API:
   - `POST /api/submissions`
   - saves signature PNG
   - persists waiver metadata (`version`, `acceptedAt`, `textHash`)
   - generates participant waiver PDF
   - stores tamper-evidence hash (`tamperHash`)
   - returns optional signed participant PDF download URL
4. Participant PDF download API:
   - `GET /api/submissions/[id]/pdf` (signed URL or admin-auth access)
5. Admin panel:
   - `GET /admin`
   - cookie-based admin session (no token in URL)
   - CSV export via `GET /api/admin/submissions.csv`
6. Admin APIs:
   - `GET /api/admin/submissions`
   - `GET /api/admin/submissions.csv`
7. Basic security controls:
   - production HTTPS enforcement middleware
   - upload/payload size limits
   - MIME allowlist checks
   - timing-safe token/signature comparisons

## Persistence modes

The app supports two storage backends:

1. `local` (default): writes files under `data/`.
2. `supabase`: stores metadata in Postgres table and files in Supabase Storage bucket.

Set with `STORAGE_BACKEND`.

## Environment variables

Copy `.env.example` to `.env.local` and configure:

```bash
cp .env.example .env.local
```

Always required:

- `ADMIN_TOKEN`
- `UPLOAD_SIGNING_SECRET`
- `NEXT_PUBLIC_FORM_URL`
- `STORAGE_BACKEND` (`local` or `supabase`)
- `APP_DEBUG_LOGS` (`1` to enable verbose API logs; recommended for local testing)

Required when `STORAGE_BACKEND=supabase`:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)
- `SUPABASE_TABLE` (optional, default `submissions`)
- `SUPABASE_STORAGE_BUCKET` (optional, default `waiver-files`)

## Recommended MVP setup: Supabase

Use `docs/SUPABASE_SETUP.md` for full setup.

Quick summary:

1. Create Supabase project.
2. Create private storage bucket (example `waiver-files`).
3. Create `public.submissions` table (SQL in docs).
4. Set `STORAGE_BACKEND=supabase` + `SUPABASE_*` env vars.
5. Run one end-to-end submission and verify table + files.

## Local run

```bash
npm install
npm run dev
```

Open:

- Waiver form: `http://localhost:3000/`
- Admin panel: `http://localhost:3000/admin`

## API examples

### Presign photo upload

```bash
curl -X POST http://localhost:3000/api/uploads/presign \
  -H 'content-type: application/json' \
  -d '{"mimeType":"image/png","size":12345}'
```

### Submit waiver

```bash
curl -X POST http://localhost:3000/api/submissions \
  -H 'content-type: application/json' \
  -d '{
    "fullName":"Jane Rider",
    "dateOfBirth":"1995-03-22",
    "email":"jane@example.com",
    "phone":"+1 555 100 2000",
    "idNumber":"A12345678",
    "emergencyContactName":"John Rider",
    "emergencyContactPhone":"+1 555 111 2222",
    "emergencyContactRelationship":"Brother",
    "consentWaiverText":true,
    "consentLiability":true,
    "consentMedical":true,
    "consentPrivacy":true,
    "signatureDataUrl":"data:image/png;base64,...",
    "photoKey":null
  }'
```

### Admin JSON with token header

```bash
curl http://localhost:3000/api/admin/submissions \
  -H "x-admin-token: $ADMIN_TOKEN"
```
