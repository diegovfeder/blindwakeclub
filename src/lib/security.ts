import crypto from "node:crypto";

import type { UploadTokenPayload } from "@/lib/types";

export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const MAX_SUBMISSION_BYTES = 2 * 1024 * 1024;
export const ADMIN_SESSION_COOKIE = "bwc_admin_session";

export const ALLOWED_IMAGE_MIME_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const DEFAULT_UPLOAD_SECRET = "change-me-in-production";

function uploadSecret(): string {
  const configured = (process.env.UPLOAD_SIGNING_SECRET || "").trim();
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV !== "production") {
    return DEFAULT_UPLOAD_SECRET;
  }

  throw new Error("UPLOAD_SIGNING_SECRET is required in production.");
}

export function isAllowedImageMime(mime: string): boolean {
  return ALLOWED_IMAGE_MIME_TYPES.has(mime.toLowerCase());
}

function normalizedJson(input: UploadTokenPayload): string {
  return JSON.stringify({
    key: input.key,
    mime: input.mime,
    size: input.size,
    expires: input.expires,
  });
}

function normalizedSubmissionPdfToken(input: { submissionId: string; expires: number }): string {
  return JSON.stringify({
    submissionId: input.submissionId,
    expires: input.expires,
  });
}

export function createUploadSignature(input: UploadTokenPayload): string {
  return crypto
    .createHmac("sha256", uploadSecret())
    .update(normalizedJson(input))
    .digest("base64url");
}

export function verifyUploadSignature(input: UploadTokenPayload, signature: string): boolean {
  const expected = createUploadSignature(input);
  if (!signature) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function createSubmissionPdfSignature(input: { submissionId: string; expires: number }): string {
  return crypto
    .createHmac("sha256", uploadSecret())
    .update(normalizedSubmissionPdfToken(input))
    .digest("base64url");
}

export function verifySubmissionPdfSignature(
  input: { submissionId: string; expires: number },
  signature: string,
): boolean {
  const expected = createSubmissionPdfSignature(input);
  if (!signature) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

export function getAdminToken(): string {
  return process.env.ADMIN_TOKEN || "";
}

export function isAdminTokenValid(token?: string | null): boolean {
  const expected = getAdminToken();
  if (!expected || !token) {
    return false;
  }

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(token);

  if (expectedBuffer.length !== actualBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, actualBuffer);
}

function readCookieByName(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const parts = cookieHeader.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    if (key !== name) {
      continue;
    }

    const value = trimmed.slice(separatorIndex + 1).trim();
    if (!value) {
      return null;
    }

    return decodeURIComponent(value);
  }

  return null;
}

export function readAdminTokenFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice("Bearer ".length).trim();
  }

  const headerToken = request.headers.get("x-admin-token");
  if (headerToken) {
    return headerToken;
  }

  const cookieToken = readCookieByName(request.headers.get("cookie"), ADMIN_SESSION_COOKIE);
  if (cookieToken) {
    return cookieToken;
  }

  return null;
}

export function normalizeMimeHeader(value: string | null): string {
  if (!value) {
    return "";
  }

  return value.split(";")[0].trim().toLowerCase();
}
