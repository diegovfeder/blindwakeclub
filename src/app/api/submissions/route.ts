import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { sha256Hex, stableStringify } from "@/lib/hash";
import { appendSubmission, photoExists, saveSignaturePng } from "@/lib/storage";
import { MAX_SUBMISSION_BYTES } from "@/lib/security";
import type { SubmissionRecord, WaiverPayload } from "@/lib/types";
import { validateWaiverPayload } from "@/lib/validation";

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
    consentLiability: Boolean(payload.consentLiability),
    consentMedical: Boolean(payload.consentMedical),
    consentPrivacy: Boolean(payload.consentPrivacy),
    photoKey: payload.photoKey || null,
  };
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_SUBMISSION_BYTES) {
    return NextResponse.json({ error: "Payload do envio muito grande." }, { status: 413 });
  }

  let body: WaiverPayload;
  try {
    body = (await request.json()) as WaiverPayload;
  } catch {
    return NextResponse.json({ error: "Payload JSON inválido." }, { status: 400 });
  }

  const validation = validateWaiverPayload(body);
  if (!validation.valid) {
    return NextResponse.json({ error: "Validação falhou.", errors: validation.errors }, { status: 400 });
  }

  const signatureBuffer = decodeSignature(body.signatureDataUrl);
  if (!signatureBuffer || signatureBuffer.length === 0 || signatureBuffer.length > 1_000_000) {
    return NextResponse.json({ error: "Imagem de assinatura inválida." }, { status: 400 });
  }

  if (body.photoKey) {
    const exists = await photoExists(body.photoKey);
    if (!exists) {
      return NextResponse.json({ error: "Chave da foto enviada não encontrada." }, { status: 400 });
    }
  }

  const id = createSubmissionId();
  const createdAt = new Date().toISOString();

  const payload = normalizePayload(body);
  const signatureKey = await saveSignaturePng(id, signatureBuffer);
  const signatureSha = sha256Hex(signatureBuffer);

  const hashPayload = {
    id,
    payload,
    signatureSha,
  };

  const tamperHash = sha256Hex(`${stableStringify(hashPayload)}|${createdAt}`);

  const record: SubmissionRecord = {
    id,
    createdAt,
    payload,
    signature: {
      key: signatureKey,
      sha256: signatureSha,
    },
    tamperHash,
  };

  await appendSubmission(record);

  return NextResponse.json(
    {
      submissionId: id,
      createdAt,
      tamperHash,
    },
    { status: 201 },
  );
}
