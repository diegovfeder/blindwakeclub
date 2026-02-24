import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { sha256Hex, stableStringify } from "@/lib/hash";
import { logApi } from "@/lib/logger";
import { generateWaiverPdf } from "@/lib/waiver-pdf";
import { appendSubmission, photoExists, saveSignaturePng, saveWaiverPdf } from "@/lib/storage";
import { createSubmissionPdfSignature, MAX_SUBMISSION_BYTES } from "@/lib/security";
import type { SubmissionRecord, WaiverPayload } from "@/lib/types";
import { validateWaiverPayload } from "@/lib/validation";
import { WAIVER_TEXT_HASH, WAIVER_VERSION } from "@/lib/waiver";

export const runtime = "nodejs";

function decodeSignature(dataUrl: string): Buffer | null {
  const match = dataUrl.match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    return null;
  }

  try {
    return Buffer.from(match[1], "base64");
  } catch {
    return null;
  }
}

function createSubmissionId(): string {
  return `sub_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
}

function normalizePayload(payload: WaiverPayload): Omit<WaiverPayload, "signatureDataUrl"> {
  return {
    fullName: payload.fullName.trim(),
    dateOfBirth: payload.dateOfBirth,
    email: payload.email.trim().toLowerCase(),
    phone: payload.phone.trim(),
    idNumber: payload.idNumber.trim(),
    emergencyContactName: payload.emergencyContactName.trim(),
    emergencyContactPhone: payload.emergencyContactPhone.trim(),
    emergencyContactRelationship: payload.emergencyContactRelationship.trim(),
    consentWaiverText: Boolean(payload.consentWaiverText),
    consentLiability: Boolean(payload.consentLiability),
    consentMedical: Boolean(payload.consentMedical),
    consentPrivacy: Boolean(payload.consentPrivacy),
    photoKey: payload.photoKey || null,
  };
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const contentLength = Number(request.headers.get("content-length") || "0");
  logApi("info", "submissions.create.start", { requestId, contentLength });

  if (contentLength > MAX_SUBMISSION_BYTES) {
    logApi("warn", "submissions.create.rejected_body_too_large", { requestId, contentLength });
    return NextResponse.json({ error: "Payload do envio muito grande." }, { status: 413 });
  }

  let body: WaiverPayload;
  try {
    body = (await request.json()) as WaiverPayload;
  } catch {
    logApi("warn", "submissions.create.invalid_json", { requestId });
    return NextResponse.json({ error: "Payload JSON inválido." }, { status: 400 });
  }

  const validation = validateWaiverPayload(body);
  if (!validation.valid) {
    logApi("warn", "submissions.create.validation_failed", {
      requestId,
      errorFields: Object.keys(validation.errors),
    });
    return NextResponse.json({ error: "Validação falhou.", errors: validation.errors }, { status: 400 });
  }

  const signatureBuffer = decodeSignature(body.signatureDataUrl);
  if (!signatureBuffer || signatureBuffer.length === 0 || signatureBuffer.length > 1_000_000) {
    logApi("warn", "submissions.create.invalid_signature_image", {
      requestId,
      signatureBytes: signatureBuffer?.length ?? 0,
    });
    return NextResponse.json({ error: "Imagem de assinatura inválida." }, { status: 400 });
  }

  try {
    if (body.photoKey) {
      const exists = await photoExists(body.photoKey);
      if (!exists) {
        logApi("warn", "submissions.create.photo_key_not_found", { requestId, photoKey: body.photoKey });
        return NextResponse.json({ error: "Chave da foto enviada não encontrada." }, { status: 400 });
      }
    }

    const id = createSubmissionId();
    const createdAt = new Date().toISOString();

    const payload = normalizePayload(body);
    const signatureKey = await saveSignaturePng(id, signatureBuffer);
    const signatureSha = sha256Hex(signatureBuffer);
    const waiverAcceptedAt = createdAt;

    const hashPayload = {
      id,
      payload,
      waiver: {
        version: WAIVER_VERSION,
        textHash: WAIVER_TEXT_HASH,
        acceptedAt: waiverAcceptedAt,
      },
      signatureSha,
    };

    const tamperHash = sha256Hex(`${stableStringify(hashPayload)}|${createdAt}`);

    const record: SubmissionRecord = {
      id,
      createdAt,
      payload,
      waiver: {
        version: WAIVER_VERSION,
        textHash: WAIVER_TEXT_HASH,
        acceptedAt: waiverAcceptedAt,
      },
      signature: {
        key: signatureKey,
        sha256: signatureSha,
      },
      documents: {
        waiverPdfKey: null,
      },
      tamperHash,
    };

    try {
      const pdfBuffer = generateWaiverPdf(record, signatureBuffer);
      const waiverPdfKey = await saveWaiverPdf(id, pdfBuffer);
      record.documents = {
        waiverPdfKey,
      };
    } catch (error) {
      logApi("error", "submissions.create.pdf_generation_failed", {
        requestId,
        submissionId: id,
        error: error instanceof Error ? error.message : String(error),
      });
      console.error("Failed to generate/save waiver PDF", error);
    }

    await appendSubmission(record);

    const responsePayload: {
      submissionId: string;
      createdAt: string;
      tamperHash: string;
      waiverVersion: string;
      pdfDownloadUrl?: string;
      pdfDownloadExpiresAt?: string;
    } = {
      submissionId: id,
      createdAt,
      tamperHash,
      waiverVersion: WAIVER_VERSION,
    };

    if (record.documents?.waiverPdfKey) {
      const expires = Date.now() + 1000 * 60 * 60 * 24 * 14;
      const signature = createSubmissionPdfSignature({ submissionId: id, expires });
      const query = new URLSearchParams({
        expires: String(expires),
        sig: signature,
      });
      responsePayload.pdfDownloadUrl = `/api/submissions/${id}/pdf?${query.toString()}`;
      responsePayload.pdfDownloadExpiresAt = new Date(expires).toISOString();
    }

    logApi("info", "submissions.create.success", {
      requestId,
      submissionId: id,
      hasPhoto: Boolean(payload.photoKey),
      hasPdf: Boolean(record.documents?.waiverPdfKey),
      waiverVersion: WAIVER_VERSION,
    });

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logApi("error", "submissions.create.internal_error", { requestId, error: message });

    return NextResponse.json(
      {
        error: "Falha interna ao salvar termo. Verifique configuração do backend de storage.",
        detail: process.env.APP_DEBUG_LOGS === "1" ? message : undefined,
      },
      { status: 500 },
    );
  }
}
