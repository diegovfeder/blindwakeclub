import type { SubmissionRecord } from "@/lib/types";
import { WAIVER_TEXT_HASH, WAIVER_VERSION } from "@/lib/waiver";

const SUPABASE_REST_API_PATH = "/rest/v1";
const SUPABASE_STORAGE_API_PATH = "/storage/v1";

interface SupabaseStorageConfig {
  supabaseUrl: string;
  serviceRoleKey: string;
  tableName: string;
  bucketName: string;
}

interface SupabaseSubmissionRow {
  id: string;
  created_at: string;
  payload_json: unknown;
  signature_key: string;
  signature_sha256: string;
  tamper_hash: string;
  waiver_json: unknown;
  waiver_pdf_key: string | null;
}

let initialized = false;

function normalizeSupabaseUrl(raw: string): string {
  return raw.trim().replace(/\/+$/, "");
}

function parseMaybeJson<T>(value: unknown): T | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return null;
    }
  }

  return value as T;
}

function readSupabaseStorageConfig(): SupabaseStorageConfig {
  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || "");
  const serviceRoleKey = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ""
  ).trim();
  const tableName = (process.env.SUPABASE_TABLE || "submissions").trim();
  const bucketName = (process.env.SUPABASE_STORAGE_BUCKET || "waiver-files").trim();

  const missing: string[] = [];
  if (!supabaseUrl) {
    missing.push("SUPABASE_URL");
  }
  if (!serviceRoleKey) {
    missing.push("SUPABASE_SERVICE_ROLE_KEY (or SUPABASE_SECRET_KEY)");
  }
  if (!tableName) {
    missing.push("SUPABASE_TABLE");
  }
  if (!bucketName) {
    missing.push("SUPABASE_STORAGE_BUCKET");
  }

  if (missing.length > 0) {
    throw new Error(`Supabase storage is missing required env vars: ${missing.join(", ")}`);
  }

  if (!/^https?:\/\//i.test(supabaseUrl)) {
    throw new Error("Invalid SUPABASE_URL format. Expected https://<project-ref>.supabase.co");
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    tableName,
    bucketName,
  };
}

export function isSupabaseStorageConfigured(): boolean {
  try {
    readSupabaseStorageConfig();
    return true;
  } catch {
    return false;
  }
}

async function readResponseDetails(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") || "";

  if (contentType.includes("application/json")) {
    try {
      const json = (await response.json()) as { message?: string; error?: string };
      return json.message || json.error || JSON.stringify(json);
    } catch {
      return `${response.status} ${response.statusText}`;
    }
  }

  try {
    const text = await response.text();
    return text || `${response.status} ${response.statusText}`;
  } catch {
    return `${response.status} ${response.statusText}`;
  }
}

async function supabaseRequest(
  config: SupabaseStorageConfig,
  path: string,
  init: RequestInit,
): Promise<Response> {
  const headers = new Headers(init.headers || {});
  headers.set("apikey", config.serviceRoleKey);
  headers.set("authorization", `Bearer ${config.serviceRoleKey}`);

  if (!headers.has("accept")) {
    headers.set("accept", "application/json");
  }

  return fetch(`${config.supabaseUrl}${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}

async function ensureTableAccessible(config: SupabaseStorageConfig): Promise<void> {
  const select = encodeURIComponent("id");
  const tablePath = `${SUPABASE_REST_API_PATH}/${encodeURIComponent(config.tableName)}`;
  const path = `${tablePath}?select=${select}&limit=1`;
  const response = await supabaseRequest(config, path, { method: "GET" });

  if (!response.ok) {
    const details = await readResponseDetails(response);
    throw new Error(
      `Unable to access Supabase table '${config.tableName}'. Create the table and check service role key. Details: ${details}`,
    );
  }
}

async function ensureBucketAccessible(config: SupabaseStorageConfig): Promise<void> {
  const path = `${SUPABASE_STORAGE_API_PATH}/bucket/${encodeURIComponent(config.bucketName)}`;
  const response = await supabaseRequest(config, path, { method: "GET" });

  if (!response.ok) {
    const details = await readResponseDetails(response);
    throw new Error(
      `Unable to access Supabase bucket '${config.bucketName}'. Create the bucket and check storage permissions. Details: ${details}`,
    );
  }
}

export async function ensureSupabaseStorage(): Promise<void> {
  if (initialized) {
    return;
  }

  const config = readSupabaseStorageConfig();
  await ensureTableAccessible(config);
  await ensureBucketAccessible(config);
  initialized = true;
}

function normalizeSubmissionRecord(record: SubmissionRecord): SubmissionRecord {
  const payload = record.payload || ({} as SubmissionRecord["payload"]);

  return {
    ...record,
    payload: {
      ...payload,
      consentWaiverText: Boolean((payload as Partial<SubmissionRecord["payload"]>).consentWaiverText),
      photoKey: payload.photoKey || null,
    },
    waiver: record.waiver || {
      version: WAIVER_VERSION,
      textHash: WAIVER_TEXT_HASH,
      acceptedAt: record.createdAt,
    },
    documents: {
      waiverPdfKey: record.documents?.waiverPdfKey || null,
    },
  };
}

function toSupabaseRow(record: SubmissionRecord): SupabaseSubmissionRow {
  const normalized = normalizeSubmissionRecord(record);

  return {
    id: normalized.id,
    created_at: normalized.createdAt,
    payload_json: normalized.payload,
    signature_key: normalized.signature.key,
    signature_sha256: normalized.signature.sha256,
    tamper_hash: normalized.tamperHash,
    waiver_json: normalized.waiver,
    waiver_pdf_key: normalized.documents?.waiverPdfKey || null,
  };
}

function fromSupabaseRow(value: unknown): SubmissionRecord | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as Partial<SupabaseSubmissionRow>;
  const id = typeof row.id === "string" ? row.id : "";
  const createdAt = typeof row.created_at === "string" ? row.created_at : "";
  const signatureKey = typeof row.signature_key === "string" ? row.signature_key : "";
  const signatureSha = typeof row.signature_sha256 === "string" ? row.signature_sha256 : "";
  const tamperHash = typeof row.tamper_hash === "string" ? row.tamper_hash : "";

  if (!id || !createdAt || !signatureKey || !signatureSha || !tamperHash) {
    return null;
  }

  const payload = parseMaybeJson<SubmissionRecord["payload"]>(row.payload_json);
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const waiver = parseMaybeJson<SubmissionRecord["waiver"]>(row.waiver_json);

  const normalized = normalizeSubmissionRecord({
    id,
    createdAt,
    payload,
    waiver:
      waiver && typeof waiver === "object"
        ? waiver
        : {
            version: WAIVER_VERSION,
            textHash: WAIVER_TEXT_HASH,
            acceptedAt: createdAt,
          },
    signature: {
      key: signatureKey,
      sha256: signatureSha,
    },
    documents: {
      waiverPdfKey: typeof row.waiver_pdf_key === "string" ? row.waiver_pdf_key : null,
    },
    tamperHash,
  });

  return normalized;
}

function tableApiPath(config: SupabaseStorageConfig): string {
  return `${SUPABASE_REST_API_PATH}/${encodeURIComponent(config.tableName)}`;
}

export async function appendSubmissionToSupabase(record: SubmissionRecord): Promise<void> {
  await ensureSupabaseStorage();
  const config = readSupabaseStorageConfig();

  const response = await supabaseRequest(config, tableApiPath(config), {
    method: "POST",
    headers: {
      "content-type": "application/json",
      prefer: "return=minimal",
    },
    body: JSON.stringify(toSupabaseRow(record)),
  });

  if (!response.ok) {
    const details = await readResponseDetails(response);
    throw new Error(`Unable to append submission row in Supabase table '${config.tableName}': ${details}`);
  }
}

export async function readSubmissionsFromSupabase(): Promise<SubmissionRecord[]> {
  await ensureSupabaseStorage();
  const config = readSupabaseStorageConfig();

  const select = encodeURIComponent(
    "id,created_at,payload_json,signature_key,signature_sha256,tamper_hash,waiver_json,waiver_pdf_key",
  );
  const path = `${tableApiPath(config)}?select=${select}&order=created_at.desc`;
  const response = await supabaseRequest(config, path, { method: "GET" });

  if (!response.ok) {
    const details = await readResponseDetails(response);
    throw new Error(`Unable to read submissions from Supabase table '${config.tableName}': ${details}`);
  }

  const rows = (await response.json()) as unknown[];

  return rows
    .map((row) => fromSupabaseRow(row))
    .filter((row): row is SubmissionRecord => row !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function objectNameForPhoto(key: string): string {
  return `photos/${key}`;
}

function objectNameForSignature(submissionId: string): string {
  return `signatures/${submissionId}.png`;
}

function objectNameForWaiverPdf(submissionId: string): string {
  return `pdfs/${submissionId}.pdf`;
}

function encodeStorageObjectPath(objectName: string): string {
  return objectName
    .split("/")
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

function storageObjectPath(config: SupabaseStorageConfig, objectName: string): string {
  const objectPath = encodeStorageObjectPath(objectName);
  return `${SUPABASE_STORAGE_API_PATH}/object/${encodeURIComponent(config.bucketName)}/${objectPath}`;
}

async function uploadObjectToSupabase(params: {
  objectName: string;
  mimeType: string;
  data: Buffer;
}): Promise<void> {
  await ensureSupabaseStorage();
  const config = readSupabaseStorageConfig();

  const response = await supabaseRequest(config, storageObjectPath(config, params.objectName), {
    method: "POST",
    headers: {
      "content-type": params.mimeType,
      "x-upsert": "false",
    },
    body: Uint8Array.from(params.data),
  });

  if (!response.ok) {
    const details = await readResponseDetails(response);
    throw new Error(
      `Unable to upload object '${params.objectName}' to Supabase bucket '${config.bucketName}': ${details}`,
    );
  }
}

async function supabaseObjectExists(objectName: string): Promise<boolean> {
  await ensureSupabaseStorage();
  const config = readSupabaseStorageConfig();

  const response = await supabaseRequest(config, storageObjectPath(config, objectName), {
    method: "GET",
    headers: {
      range: "bytes=0-0",
      accept: "*/*",
    },
  });

  if (response.status === 404) {
    return false;
  }

  if (response.status === 200 || response.status === 206) {
    return true;
  }

  if (!response.ok) {
    const details = await readResponseDetails(response);
    throw new Error(
      `Unable to check object '${objectName}' in Supabase bucket '${config.bucketName}': ${details}`,
    );
  }

  return true;
}

export async function savePhotoToSupabase(key: string, buffer: Buffer, mimeType: string): Promise<string> {
  const objectName = objectNameForPhoto(key);
  await uploadObjectToSupabase({ objectName, mimeType, data: buffer });
  return key;
}

export async function saveSignatureToSupabase(submissionId: string, buffer: Buffer): Promise<string> {
  const objectName = objectNameForSignature(submissionId);
  await uploadObjectToSupabase({ objectName, mimeType: "image/png", data: buffer });
  return objectName;
}

export async function saveWaiverPdfToSupabase(submissionId: string, buffer: Buffer): Promise<string> {
  const objectName = objectNameForWaiverPdf(submissionId);
  await uploadObjectToSupabase({ objectName, mimeType: "application/pdf", data: buffer });
  return objectName;
}

export async function readSupabaseFileById(fileId: string): Promise<Buffer | null> {
  await ensureSupabaseStorage();
  const config = readSupabaseStorageConfig();
  const objectName = fileId;

  const response = await supabaseRequest(config, storageObjectPath(config, objectName), {
    method: "GET",
    headers: {
      accept: "*/*",
    },
  });

  if (response.status === 404) {
    return null;
  }

  if (!response.ok) {
    const details = await readResponseDetails(response);
    throw new Error(`Unable to read object '${objectName}' from Supabase bucket '${config.bucketName}': ${details}`);
  }

  const bytes = await response.arrayBuffer();
  return Buffer.from(bytes);
}

export async function supabasePhotoExists(photoKey: string): Promise<boolean> {
  return supabaseObjectExists(objectNameForPhoto(photoKey));
}
