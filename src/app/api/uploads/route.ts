import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { logApi } from "@/lib/logger";
import {
  isAllowedImageMime,
  MAX_UPLOAD_BYTES,
  normalizeMimeHeader,
  verifyUploadSignature,
} from "@/lib/security";
import { savePhoto } from "@/lib/storage";
import { isSafePhotoKey } from "@/lib/validation";

export const runtime = "nodejs";

function invalidSignatureResponse(): Response {
  return NextResponse.json({ error: "Token de upload inválido ou expirado." }, { status: 401 });
}

export async function PUT(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const url = new URL(request.url);

  const key = url.searchParams.get("key") || "";
  const mime = (url.searchParams.get("mime") || "").toLowerCase();
  const size = Number(url.searchParams.get("size") || "NaN");
  const expires = Number(url.searchParams.get("expires") || "NaN");
  const signature = url.searchParams.get("sig") || "";

  logApi("info", "uploads.put.start", { requestId, key, mime, size, expires });

  if (!isSafePhotoKey(key)) {
    logApi("warn", "uploads.put.invalid_key", { requestId, key });
    return NextResponse.json({ error: "Chave de arquivo inválida." }, { status: 400 });
  }

  if (!isAllowedImageMime(mime)) {
    logApi("warn", "uploads.put.invalid_mime", { requestId, mime });
    return NextResponse.json({ error: "Tipo MIME inválido." }, { status: 400 });
  }

  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    logApi("warn", "uploads.put.invalid_size", { requestId, size });
    return NextResponse.json({ error: "Tamanho de arquivo inválido." }, { status: 400 });
  }

  if (!Number.isFinite(expires) || Date.now() > expires) {
    logApi("warn", "uploads.put.expired_token", { requestId, expires });
    return invalidSignatureResponse();
  }

  const tokenPayload = { key, mime, size, expires };

  if (!verifyUploadSignature(tokenPayload, signature)) {
    logApi("warn", "uploads.put.invalid_signature", { requestId, key });
    return invalidSignatureResponse();
  }

  const requestMime = normalizeMimeHeader(request.headers.get("content-type"));
  if (requestMime !== mime) {
    logApi("warn", "uploads.put.content_type_mismatch", { requestId, expectedMime: mime, requestMime });
    return NextResponse.json({ error: "Content-Type não corresponde ao esperado." }, { status: 415 });
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    logApi("warn", "uploads.put.content_length_too_large", { requestId, contentLength });
    return NextResponse.json({ error: "O arquivo enviado é muito grande." }, { status: 413 });
  }

  const body = Buffer.from(await request.arrayBuffer());
  if (!body.length || body.length > MAX_UPLOAD_BYTES) {
    logApi("warn", "uploads.put.body_too_large_or_empty", { requestId, bodyLength: body.length });
    return NextResponse.json({ error: "O arquivo enviado é muito grande." }, { status: 413 });
  }

  if (body.length !== size) {
    logApi("warn", "uploads.put.size_mismatch", { requestId, expectedSize: size, actualSize: body.length });
    return NextResponse.json(
      { error: "O tamanho do arquivo enviado não corresponde à solicitação de presign." },
      { status: 400 },
    );
  }

  try {
    const storedPhotoKey = await savePhoto(key, body, mime);

    logApi("info", "uploads.put.success", {
      requestId,
      key,
      storedPhotoKey,
      bytes: body.length,
    });

    return NextResponse.json({ key: storedPhotoKey, bytes: body.length }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logApi("error", "uploads.put.internal_error", { requestId, key, error: message });

    return NextResponse.json(
      {
        error: "Falha interna ao salvar upload. Verifique configuração do backend de storage.",
        detail: process.env.APP_DEBUG_LOGS === "1" ? message : undefined,
      },
      { status: 500 },
    );
  }
}
