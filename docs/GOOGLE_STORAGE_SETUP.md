# Google Storage Setup (Sheets + Drive)

This runbook configures durable storage for Vercel deployment.

## What You Need

1. A Google Cloud project.
2. Google Sheets API enabled.
3. Google Drive API enabled.
4. A service account with JSON key.
5. One Google Sheet (metadata rows).
6. One Google Drive folder (photo/signature files).

## Step 1: Create Service Account

1. Open Google Cloud Console.
2. Go to IAM & Admin -> Service Accounts.
3. Create account (example name: `blindwake-waiver-bot`).
4. Open the account and create a JSON key.
5. Download JSON once and store it securely.

You will use:

- `client_email` -> `GOOGLE_SERVICE_ACCOUNT_EMAIL`
- `private_key` -> `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`

## Step 2: Enable APIs

In Google Cloud Console -> APIs & Services -> Library:

1. Enable `Google Sheets API`.
2. Enable `Google Drive API`.

## Step 3: Create Spreadsheet and Drive Folder

1. Create a Google Sheet for submissions.
2. Create a Google Drive folder for uploaded files.
3. Share both with the service account email (`client_email`) as Editor.

If not shared, API calls will fail with 403/404.

## Step 4: Get IDs

### Spreadsheet ID

From URL:

`https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`

### Drive Folder ID

From URL:

`https://drive.google.com/drive/folders/<FOLDER_ID>`

## Step 5: Configure Environment Variables

Required:

- `STORAGE_BACKEND=google`
- `GOOGLE_SERVICE_ACCOUNT_EMAIL=<client_email>`
- `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY=<private_key with escaped newlines>`
- `GOOGLE_SHEETS_SPREADSHEET_ID=<spreadsheet id>`
- `GOOGLE_SHEETS_TAB_NAME=Submissions` (or your tab name)
- `GOOGLE_DRIVE_FOLDER_ID=<folder id>`

Also required for app security:

- `ADMIN_TOKEN`
- `UPLOAD_SIGNING_SECRET`
- `NEXT_PUBLIC_FORM_URL`

## Private Key Format

In Vercel env vars, use escaped newlines (`\\n`), not real line breaks.

Example conversion from service-account JSON file:

```bash
node -e 'const fs=require("fs");const j=JSON.parse(fs.readFileSync("service-account.json","utf8"));console.log(j.private_key.replace(/\\n/g,"\\\\n"))'
```

## Step 6: Add Env Vars in Vercel

Project -> Settings -> Environment Variables:

1. Add all values for Production.
2. Add the same values for Preview if you test previews.
3. Redeploy after saving env vars.

## Verification Checklist

1. Open `/admin` and authenticate.
2. Submit one waiver with photo from `/`.
3. Confirm one new row in the target Sheet tab.
4. Confirm two files in Drive folder:
   - one photo file
   - one signature file (`signature_sub_...png`)
5. Confirm `/api/admin/submissions.csv` exports expected row.

## Troubleshooting

- `Failed to get Google access token`:
  - check `GOOGLE_SERVICE_ACCOUNT_EMAIL` and private key format.
- `Unable to upload file to Google Drive`:
  - ensure Drive API enabled and folder is shared with service account.
- `Unable to append submission row`:
  - ensure Sheets API enabled and spreadsheet is shared with service account.
- Photo key not found during submission:
  - upload may have failed; inspect `/api/uploads` response and Drive write permissions.
