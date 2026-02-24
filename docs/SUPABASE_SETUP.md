# Supabase Setup (Low-Cost MVP)

Use this when you want to run production without Google Cloud prepayment.

## What This Backend Uses

- Supabase Postgres table for submission metadata.
- Supabase Storage bucket for files:
  - `photos/*`
  - `signatures/*`
  - `pdfs/*`

## Step 1: Create Supabase Project

1. Go to [Supabase](https://supabase.com/) and create a project.
2. Save:
   - Project URL (`https://<project-ref>.supabase.co`)
   - server-side key from Project Settings -> API:
     - legacy label: `service_role`
     - newer label in some dashboards: `secret` key

Important:
- Use only server-side key on the server (`SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`).
- Never expose service role key in client-side env vars.

## Step 2: Create Storage Bucket

1. Open Storage in Supabase dashboard.
2. Create bucket: `waiver-files` (or any name you prefer).
3. Keep it private.

## Step 3: Create Table

Run this in Supabase SQL Editor:

```sql
create table if not exists public.submissions (
  id text primary key,
  created_at text not null,
  payload_json jsonb not null,
  signature_key text not null,
  signature_sha256 text not null,
  tamper_hash text not null,
  waiver_json jsonb not null,
  waiver_pdf_key text null
);

create index if not exists submissions_created_at_idx
  on public.submissions (created_at desc);
```

Notes:
- The app uses the service role key server-side, so RLS policies are not required for this MVP path.

## Step 4: Configure Local Env

Create local env file:

```bash
cp .env.example .env.local
```

Set:

```env
ADMIN_TOKEN=<strong token>
UPLOAD_SIGNING_SECRET=<strong random secret>
NEXT_PUBLIC_FORM_URL=http://localhost:3000
STORAGE_BACKEND=supabase
APP_DEBUG_LOGS=1

SUPABASE_URL=https://<project-ref>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
# or SUPABASE_SECRET_KEY=<secret key>
SUPABASE_TABLE=submissions
SUPABASE_STORAGE_BUCKET=waiver-files
```

## Step 5: Run and Verify

1. Run app: `npm run dev`
2. Submit one waiver with photo.
3. Validate:
   - one row in `public.submissions`
   - files in Storage:
     - `photos/...`
     - `signatures/...`
     - `pdfs/...`
   - admin list/CSV still works
   - participant PDF download still works

## Step 6: Configure Vercel

Set the same vars in Vercel Project Settings -> Environment Variables:

- `STORAGE_BACKEND=supabase`
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` (or `SUPABASE_SECRET_KEY`)
- `SUPABASE_TABLE`
- `SUPABASE_STORAGE_BUCKET`
- plus `ADMIN_TOKEN`, `UPLOAD_SIGNING_SECRET`, `NEXT_PUBLIC_FORM_URL`

Then redeploy.

## Common Errors

- `Supabase storage is missing required env vars`:
  - missing one or more `SUPABASE_*` variables.
- `Unable to access Supabase table ...`:
  - table not created or wrong table name.
- `Unable to access Supabase bucket ...`:
  - bucket not created or wrong name.
- `Unable to upload object ...`:
  - invalid service role key or bucket issues.
