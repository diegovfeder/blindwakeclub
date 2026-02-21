# Assets Directory

This directory stores static assets for the Blind Wake Club Next.js waiver app.

## Current State

- The app is already custom-built in this repository (`/waiver`, `/api/*`, `/admin/submissions`).
- QR documentation is generated into `docs/QR_CODE.md`.
- The generated QR image URL is written to `public/qr/waiver-form-url.txt`.

## QR Code Workflow (Current App)

1. Set the public waiver URL in `.env.local`:
   - `NEXT_PUBLIC_FORM_URL=https://your-domain.example/waiver`
2. Regenerate QR docs/link:
   - `npm run qr:generate`
3. Use the QR image URL from `docs/QR_CODE.md` or `public/qr/waiver-form-url.txt`.
4. Download and save a print-ready copy in this folder as:
   - `assets/waiver-qr-code.png` (recommended)

## Recommended Asset Files

- `waiver-qr-code.png` - Print-ready QR for the published `/waiver` URL.
- `logo.png` - Brand logo for future UI/print usage.
- `waiver-signage-template.pdf` - Printable signage template for onsite posting.

## Printing Guidance

- Minimum poster size: Letter / A4.
- Recommended size: Tabloid / A3 for better scanning distance.
- Place signs at check-in, entrance, and equipment areas.
- Use high error-correction when generating stylized QR versions.

## Operational Notes

- Any time the production waiver URL changes, run `npm run qr:generate` again.
- Replace all printed copies after regeneration to avoid stale links.

**Last Updated:** 2026-02-14
