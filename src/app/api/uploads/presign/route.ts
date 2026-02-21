import { NextResponse } from "next/server";

import { createUploadSignature, isAllowedImageMime, MAX_UPLOAD_BYTES } from "@/lib/security";
import { generateUploadKey } from "@/lib/uploads";

export const runtime = "nodejs";

interface PresignRequestBody {
  mimeType?: string;
  size?: number;
}

const MAX_REQUEST_BYTES = 16_384;

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") || "0");
  if (contentLength > MAX_REQUEST_BYTES) {
    return NextResponse.json({ error: "Corpo da requisição muito grande." }, { status: 413 });
  }

  let body: PresignRequestBody;
  try {
    body = (await request.json()) as PresignRequestBody;
  } catch {
    return NextResponse.json({ error: "Payload JSON inválido." }, { status: 400 });
  }

  const mimeType = typeof body.mimeType === "string" ? body.mimeType.toLowerCase() : "";
  const size = typeof body.size === "number" ? body.size : NaN;
  if (!isAllowedImageMime(mimeType)) {
    return NextResponse.json(
      { error: "Tipo de arquivo inválido. Permitidos: image/jpeg, image/png, image/webp." },
      { status: 400 },
    );
  }

  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) {
    return NextResponse.json(
      { error: `Tamanho de arquivo inválido. O máximo permitido é ${MAX_UPLOAD_BYTES} bytes.` },
      { status: 400 },
    );
  }

  const key = generateUploadKey(mimeType);
  const expires = Date.now() + 5 * 60 * 1000;

  const signature = createUploadSignature({
    key,
    mime: mimeType,
    size,
    expires,
  });

  const searchParams = new URLSearchParams({
    key,
    mime: mimeType,
    size: String(size),
    expires: String(expires),
    sig: signature,
  });

  return NextResponse.json({
    key,
    uploadUrl: `/api/uploads?${searchParams.toString()}`,
    expiresAt: new Date(expires).toISOString(),
  });
}
