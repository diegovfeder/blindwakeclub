# Waiver PDF and Delivery Plan

This document defines how to present legal text and deliver participant proof.

## Current Status

Implemented in app:

- Full legal text rendered in form.
- Required acceptance tied to waiver version.
- Waiver metadata persisted (`version`, `acceptedAt`, `textHash`).
- PDF generated and stored on submission.
- Signature image embedded in generated PDF.
- Participant download available via signed URL.

Pending:

- Optional email delivery.

## Recommendation

Ship in two phases:

1. **Phase 1 (now):**
   - Show full legal waiver text in the form.
   - Require explicit acceptance tied to waiver version.
   - Generate participant PDF after successful submission.
   - Provide download on success page.
2. **Phase 2 (optional):**
   - Send participant copy by email (link or attachment).

This keeps MVP operational and avoids email complexity on first launch.

## Why This Approach

- Participants can read/skim full text before signing.
- Club gets stronger evidence of informed consent.
- Participant receives copy immediately.
- Email can be added later without blocking launch.

## UX Requirements

1. Add a visible section: `Leia o termo completo`.
2. Show the full text (scrollable panel or modal).
3. Add mandatory checkbox:
   - `Li e concordo com o termo completo (versão waiver-v1.0-ptbr).`
4. Keep existing signature requirement.
5. Success page should show:
   - submission id
   - `Baixar meu termo (PDF)` button

## Data Requirements

Add to submission model:

- `waiverVersion` (example: `waiver-v1.0-ptbr`)
- `waiverAcceptedAt` (ISO timestamp)
- `waiverTextHash` (sha256 of canonical legal text)

These fields provide stronger legal traceability.

## PDF Requirements (Target)

PDF must include:

1. Full legal waiver text.
2. Participant data snapshot (name, date of birth, document, email, phone, emergency contact).
3. Consent flags.
4. Acceptance timestamp.
5. Submission id and tamper hash.
6. Embedded signature image (PNG from canvas).
7. Optional photo reference (or embed if desired).

## Storage Requirements

When `STORAGE_BACKEND=supabase`:

- store generated PDF in Supabase Storage
- store object key in submission record

When `STORAGE_BACKEND=local`:

- save PDF under `data/pdfs/`
- store local key/path in submission record

## Email Delivery (Phase 2)

Recommended provider: Resend (simple API, good for transactional email).

Options:

1. Send secure download link (preferred for privacy).
2. Send PDF attachment (heavier payload).

Minimum email fields:

- recipient email (participant)
- subject: `Sua via do termo - Blind Wake Club`
- submission id reference

## Security and Legal Notes

1. Do not rely only on generic checkbox; keep signature + versioned text evidence.
2. Avoid public direct links to private documents.
3. Use time-limited signed URLs for downloads when storage is external.
4. Validate legal wording and enforceability with a licensed lawyer in your jurisdiction.

## Implementation Backlog

### P0

1. Add canonical waiver version constant and text source.
2. Render full waiver text in form UI.
3. Add required acceptance checkbox linked to version.
4. Persist acceptance/version/hash fields.
5. Generate PDF and expose secure download endpoint.

### P1

1. Embed signature image in generated PDF.
2. Add automated tests for waiver version/hash persistence.
3. Add optional participant email delivery.

### P2

1. Add bilingual versioning if needed (`pt-BR`, `en-US`).
2. Add legal text archive table for historical retrieval.
