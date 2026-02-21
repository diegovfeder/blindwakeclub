# Blind Wake Club Waiver App

Standalone Next.js App Router project for digital waiver intake.

Documentation index: `docs/README.md`

## What is implemented

1. `/` waiver form with required fields, consents, canvas signature, and optional photo upload.
2. Secure upload flow:
   - `POST /api/uploads/presign`
   - `PUT /api/uploads`
3. Waiver submission API:
   - `POST /api/submissions`
   - saves signature PNG
   - stores tamper-evidence hash (`tamperHash`)
4. Admin panel:
   - `GET /admin`
   - cookie-based admin session (no token in URL)
   - CSV export via `GET /api/admin/submissions.csv`
5. Admin APIs:
   - `GET /api/admin/submissions`
   - `GET /api/admin/submissions.csv`
6. Basic security controls:
   - production HTTPS enforcement middleware
   - upload/payload size limits
   - MIME allowlist checks
   - timing-safe token/signature comparisons

## Persistence modes

The app supports two storage backends:

1. `local` (default): writes files under `data/`.
2. `google`: stores metadata in Google Sheets and files (photos/signatures) in Google Drive.

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
- `STORAGE_BACKEND` (`local` or `google`)

Required when `STORAGE_BACKEND=google`:

- `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`
- `GOOGLE_SHEETS_SPREADSHEET_ID`
- `GOOGLE_SHEETS_TAB_NAME` (optional, default `Submissions`)
- `GOOGLE_DRIVE_FOLDER_ID`

## Google storage setup (Vercel-ready)

1. Create a Google Cloud service account and generate a JSON key.
2. Create a Google Sheet for submissions.
3. Create a Google Drive folder for uploaded files.
4. Share both the spreadsheet and the drive folder with the service account email.
5. Add env vars in Vercel Project Settings.
6. For `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`, paste the key with escaped line breaks (`\n`).

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
