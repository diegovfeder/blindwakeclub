import crypto from "node:crypto";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function extensionForMime(mime: string): string {
  return EXTENSIONS[mime] || "bin";
}

export function generateUploadKey(mime: string): string {
  const ext = extensionForMime(mime);
  const random = crypto.randomBytes(12).toString("hex");
  return `photo_${Date.now()}_${random}.${ext}`;
}
