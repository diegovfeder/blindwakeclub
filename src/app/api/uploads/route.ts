import { NextResponse } from "next/server";

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
  const url = new URL(request.url);

  const key = url.searchParams.get("key") || "";
  const mime = (url.searchParams.get("mime") || "").toLowerCase();
  const size = Number(url.searchParams.get("size") || "NaN");
  const expires = Number(url.searchParams.get("expires") || "NaN");
  const signature = url.searchParams.get("sig") || "";

  if (!isSafePhotoKey(key)) {
    return NextResponse.json({ error: "Chave de arquivo inválida." }, { status: 400 });
  }

  if (!isAllowedImageMime(mime)) {
    return NextResponse.json({ error: "Tipo MIME inválido." }, { status: 400 });
  }

  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Tamanho de arquivo inválido." }, { status: 400 });
  }

  if (!Number.isFinite(expires) || Date.now() > expires) {
    return invalidSignatureResponse();
  }

  const tokenPayload = { key, mime, size, expires };

  if (!verifyUploadSignature(tokenPayload, signature)) {
    return invalidSignatureResponse();
  }

  const requestMime = normalizeMimeHeader(request.headers.get("content-type"));
  if (requestMime !== mime) {
    return NextResponse.json({ error: "Content-Type não corresponde ao esperado." }, { status: 415 });
  }

  const contentLength = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(contentLength) && contentLength > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "O arquivo enviado é muito grande." }, { status: 413 });
  }

  const body = Buffer.from(await request.arrayBuffer());
  if (!body.length || body.length > MAX_UPLOAD_BYTES) {
    return NextResponse.json({ error: "O arquivo enviado é muito grande." }, { status: 413 });
  }

  if (body.length !== size) {
    return NextResponse.json(
      { error: "O tamanho do arquivo enviado não corresponde à solicitação de presign." },
      { status: 400 },
    );
  }

  const storedPhotoKey = await savePhoto(key, body, mime);

  return NextResponse.json({ key: storedPhotoKey, bytes: body.length }, { status: 201 });
}
