import crypto from "node:crypto";

import type { SubmissionRecord } from "@/lib/types";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_DRIVE_UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id";
const GOOGLE_DRIVE_FILE_URL = "https://www.googleapis.com/drive/v3/files";
const GOOGLE_SHEETS_API_URL = "https://sheets.googleapis.com/v4/spreadsheets";
const SHEET_HEADERS = [
  "id",
  "createdAt",
  "payloadJson",
  "signatureKey",
  "signatureSha256",
  "tamperHash",
] as const;

interface GoogleStorageConfig {
  serviceAccountEmail: string;
  serviceAccountPrivateKey: string;
  spreadsheetId: string;
  driveFolderId: string;
  sheetName: string;
}

interface TokenCache {
  accessToken: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;
let initialized = false;

function readGoogleStorageConfig(): GoogleStorageConfig {
  const serviceAccountEmail = (process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "").trim();
  const serviceAccountPrivateKeyRaw = process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || "";
  const spreadsheetId = (process.env.GOOGLE_SHEETS_SPREADSHEET_ID || "").trim();
  const driveFolderId = (process.env.GOOGLE_DRIVE_FOLDER_ID || "").trim();
  const sheetName = (process.env.GOOGLE_SHEETS_TAB_NAME || "Submissions").trim();

  const missing: string[] = [];
  if (!serviceAccountEmail) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  }
  if (!serviceAccountPrivateKeyRaw) {
    missing.push("GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY");
  }
  if (!spreadsheetId) {
    missing.push("GOOGLE_SHEETS_SPREADSHEET_ID");
  }
  if (!driveFolderId) {
    missing.push("GOOGLE_DRIVE_FOLDER_ID");
  }

  if (missing.length > 0) {
    throw new Error(`Google storage is missing required env vars: ${missing.join(", ")}`);
  }

  return {
    serviceAccountEmail,
    serviceAccountPrivateKey: serviceAccountPrivateKeyRaw.replace(/\\n/g, "\n"),
    spreadsheetId,
    driveFolderId,
    sheetName: sheetName || "Submissions",
  };
}

export function isGoogleStorageConfigured(): boolean {
  try {
    readGoogleStorageConfig();
    return true;
  } catch {
    return false;
  }
}

function base64UrlEncode(value: string): string {
  return Buffer.from(value, "utf8").toString("base64url");
}

function createSignedJwtAssertion(config: GoogleStorageConfig): string {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + 3600;

  const header = base64UrlEncode(
    JSON.stringify({
      alg: "RS256",
      typ: "JWT",
    }),
  );

  const payload = base64UrlEncode(
    JSON.stringify({
      iss: config.serviceAccountEmail,
      scope:
        "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets",
      aud: GOOGLE_TOKEN_URL,
      iat: issuedAt,
      exp: expiresAt,
    }),
  );

  const unsignedToken = `${header}.${payload}`;

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(unsignedToken);
  signer.end();

  const signature = signer
    .sign(config.serviceAccountPrivateKey)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");

  return `${unsignedToken}.${signature}`;
}

async function getGoogleAccessToken(config: GoogleStorageConfig): Promise<string> {
  const now = Date.now();
  if (tokenCache && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.accessToken;
  }

  const assertion = createSignedJwtAssertion(config);

  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }).toString(),
  });

  const payload = (await response.json()) as {
    access_token?: string;
    expires_in?: number;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !payload.access_token) {
    const details = payload.error_description || payload.error || response.statusText;
    throw new Error(`Failed to get Google access token: ${details}`);
  }

  const expiresIn = typeof payload.expires_in === "number" ? payload.expires_in : 3600;
  tokenCache = {
    accessToken: payload.access_token,
    expiresAt: Date.now() + expiresIn * 1000,
  };

  return payload.access_token;
}

async function googleRequest(
  config: GoogleStorageConfig,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const accessToken = await getGoogleAccessToken(config);

  const headers = new Headers(init.headers || {});
  headers.set("authorization", `Bearer ${accessToken}`);

  return fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });
}

function sheetRange(sheetName: string, range: string): string {
  return `${encodeURIComponent(`'${sheetName}'!${range}`)}`;
}

async function ensureSheetExists(config: GoogleStorageConfig): Promise<void> {
  const detailsUrl = `${GOOGLE_SHEETS_API_URL}/${config.spreadsheetId}?fields=sheets.properties.title`;
  const detailsResponse = await googleRequest(config, detailsUrl, { method: "GET" });

  if (!detailsResponse.ok) {
    const text = await detailsResponse.text();
    throw new Error(`Unable to read spreadsheet metadata: ${text}`);
  }

  const details = (await detailsResponse.json()) as {
    sheets?: Array<{
      properties?: {
        title?: string;
      };
    }>;
  };

  const exists = details.sheets?.some((sheet) => sheet.properties?.title === config.sheetName);
  if (exists) {
    return;
  }

  const addSheetUrl = `${GOOGLE_SHEETS_API_URL}/${config.spreadsheetId}:batchUpdate`;
  const addSheetResponse = await googleRequest(config, addSheetUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: {
              title: config.sheetName,
            },
          },
        },
      ],
    }),
  });

  if (!addSheetResponse.ok) {
    const text = await addSheetResponse.text();
    throw new Error(`Unable to create sheet tab '${config.sheetName}': ${text}`);
  }
}

async function ensureSheetHeaders(config: GoogleStorageConfig): Promise<void> {
  const getHeaderUrl = `${GOOGLE_SHEETS_API_URL}/${config.spreadsheetId}/values/${sheetRange(
    config.sheetName,
    "A1:F1",
  )}`;

  const headerResponse = await googleRequest(config, getHeaderUrl, { method: "GET" });
  if (!headerResponse.ok) {
    const text = await headerResponse.text();
    throw new Error(`Unable to read sheet headers: ${text}`);
  }

  const payload = (await headerResponse.json()) as {
    values?: string[][];
  };

  const existing = payload.values?.[0] || [];
  const matches = SHEET_HEADERS.every((value, index) => existing[index] === value);
  if (matches) {
    return;
  }

  const writeHeaderUrl = `${GOOGLE_SHEETS_API_URL}/${config.spreadsheetId}/values/${sheetRange(
    config.sheetName,
    "A1:F1",
  )}?valueInputOption=RAW`;

  const writeResponse = await googleRequest(config, writeHeaderUrl, {
    method: "PUT",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      range: `${config.sheetName}!A1:F1`,
      majorDimension: "ROWS",
      values: [Array.from(SHEET_HEADERS)],
    }),
  });

  if (!writeResponse.ok) {
    const text = await writeResponse.text();
    throw new Error(`Unable to write sheet headers: ${text}`);
  }
}

export async function ensureGoogleStorage(): Promise<void> {
  if (initialized) {
    return;
  }

  const config = readGoogleStorageConfig();
  await ensureSheetExists(config);
  await ensureSheetHeaders(config);
  initialized = true;
}

function createMultipartUploadBody(
  metadata: Record<string, unknown>,
  mimeType: string,
  fileBuffer: Buffer,
  boundary: string,
): Buffer {
  const metadataPart = Buffer.from(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    "utf8",
  );

  const fileHeaderPart = Buffer.from(
    `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    "utf8",
  );

  const closingPart = Buffer.from(`\r\n--${boundary}--`, "utf8");

  return Buffer.concat([metadataPart, fileHeaderPart, fileBuffer, closingPart]);
}

async function uploadFileToDrive(params: {
  name: string;
  mimeType: string;
  data: Buffer;
  appProperties?: Record<string, string>;
}): Promise<string> {
  const config = readGoogleStorageConfig();
  const boundary = `waiver-${crypto.randomBytes(12).toString("hex")}`;

  const metadata: Record<string, unknown> = {
    name: params.name,
    parents: [config.driveFolderId],
  };

  if (params.appProperties) {
    metadata.appProperties = params.appProperties;
  }

  const body = createMultipartUploadBody(metadata, params.mimeType, params.data, boundary);
  const multipartBody = Uint8Array.from(body);

  const response = await googleRequest(config, GOOGLE_DRIVE_UPLOAD_URL, {
    method: "POST",
    headers: {
      "content-type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartBody,
  });

  const payload = (await response.json()) as {
    id?: string;
    error?: {
      message?: string;
    };
  };

  if (!response.ok || !payload.id) {
    const details = payload.error?.message || response.statusText;
    throw new Error(`Unable to upload file to Google Drive: ${details}`);
  }

  return payload.id;
}

function serializeSubmission(row: SubmissionRecord): string[] {
  return [
    row.id,
    row.createdAt,
    JSON.stringify(row.payload),
    row.signature.key,
    row.signature.sha256,
    row.tamperHash,
  ];
}

function parseSubmissionRow(values: string[]): SubmissionRecord | null {
  if (values.length < 6) {
    return null;
  }

  const [id, createdAt, payloadJson, signatureKey, signatureSha, tamperHash] = values;
  if (!id || !createdAt || !payloadJson || !signatureKey || !signatureSha || !tamperHash) {
    return null;
  }

  try {
    const payload = JSON.parse(payloadJson) as SubmissionRecord["payload"];

    return {
      id,
      createdAt,
      payload,
      signature: {
        key: signatureKey,
        sha256: signatureSha,
      },
      tamperHash,
    };
  } catch {
    return null;
  }
}

export async function appendSubmissionToGoogle(row: SubmissionRecord): Promise<void> {
  await ensureGoogleStorage();
  const config = readGoogleStorageConfig();

  const appendUrl = `${GOOGLE_SHEETS_API_URL}/${config.spreadsheetId}/values/${sheetRange(
    config.sheetName,
    "A:F",
  )}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;

  const response = await googleRequest(config, appendUrl, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      range: `${config.sheetName}!A:F`,
      majorDimension: "ROWS",
      values: [serializeSubmission(row)],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to append submission row: ${text}`);
  }
}

export async function readSubmissionsFromGoogle(): Promise<SubmissionRecord[]> {
  await ensureGoogleStorage();
  const config = readGoogleStorageConfig();

  const readUrl = `${GOOGLE_SHEETS_API_URL}/${config.spreadsheetId}/values/${sheetRange(
    config.sheetName,
    "A2:F",
  )}`;

  const response = await googleRequest(config, readUrl, { method: "GET" });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to read submissions from Google Sheets: ${text}`);
  }

  const payload = (await response.json()) as {
    values?: string[][];
  };

  const rows = (payload.values || [])
    .map((row) => parseSubmissionRow(row))
    .filter((row): row is SubmissionRecord => row !== null);

  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function savePhotoToGoogle(key: string, buffer: Buffer, mimeType: string): Promise<string> {
  return uploadFileToDrive({
    name: key,
    mimeType,
    data: buffer,
    appProperties: {
      waiverKind: "photo",
      waiverUploadKey: key,
    },
  });
}

export async function saveSignatureToGoogle(submissionId: string, buffer: Buffer): Promise<string> {
  return uploadFileToDrive({
    name: `signature_${submissionId}.png`,
    mimeType: "image/png",
    data: buffer,
    appProperties: {
      waiverKind: "signature",
      submissionId,
    },
  });
}

export async function googlePhotoExists(photoKey: string): Promise<boolean> {
  const config = readGoogleStorageConfig();

  const url = `${GOOGLE_DRIVE_FILE_URL}/${encodeURIComponent(
    photoKey,
  )}?fields=id,trashed,appProperties&supportsAllDrives=true`;

  const response = await googleRequest(config, url, { method: "GET" });
  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Unable to check photo key in Google Drive: ${text}`);
  }

  const payload = (await response.json()) as {
    id?: string;
    trashed?: boolean;
    appProperties?: Record<string, string>;
  };

  if (!payload.id || payload.trashed) {
    return false;
  }

  return payload.appProperties?.waiverKind === "photo";
}
