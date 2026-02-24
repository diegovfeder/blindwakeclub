import fs from "node:fs/promises";
import path from "node:path";

import {
  appendSubmissionToSupabase,
  ensureSupabaseStorage,
  isSupabaseStorageConfigured,
  readSubmissionsFromSupabase,
  readSupabaseFileById,
  savePhotoToSupabase,
  saveSignatureToSupabase,
  saveWaiverPdfToSupabase,
  supabasePhotoExists,
} from "@/lib/supabase-storage";
import type { SubmissionRecord } from "@/lib/types";
import { WAIVER_TEXT_HASH, WAIVER_VERSION } from "@/lib/waiver";

const DATA_DIR = path.join(process.cwd(), "data");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const PHOTO_DIR = path.join(DATA_DIR, "photos");
const SIGNATURE_DIR = path.join(DATA_DIR, "signatures");
const PDF_DIR = path.join(DATA_DIR, "pdfs");

type StorageBackend = "local" | "supabase";

let localInitialized = false;

function readStorageBackend(): StorageBackend {
  const configured = (process.env.STORAGE_BACKEND || "local").trim().toLowerCase();
  if (configured === "supabase") {
    return "supabase";
  }

  if (configured === "google") {
    throw new Error("STORAGE_BACKEND=google is no longer supported. Use STORAGE_BACKEND=supabase.");
  }

  return "local";
}

function isSupabaseBackend(): boolean {
  return readStorageBackend() === "supabase";
}

function normalizeSubmissionRecord(row: SubmissionRecord): SubmissionRecord {
  const payload = row.payload || ({} as SubmissionRecord["payload"]);

  return {
    ...row,
    payload: {
      ...payload,
      consentWaiverText: Boolean((payload as Partial<SubmissionRecord["payload"]>).consentWaiverText),
      photoKey: payload.photoKey || null,
    },
    waiver: row.waiver || {
      version: WAIVER_VERSION,
      textHash: WAIVER_TEXT_HASH,
      acceptedAt: row.createdAt,
    },
    documents: {
      waiverPdfKey: row.documents?.waiverPdfKey || null,
    },
  };
}

async function ensureLocalStorage(): Promise<void> {
  if (localInitialized) {
    return;
  }

  await fs.mkdir(PHOTO_DIR, { recursive: true });
  await fs.mkdir(SIGNATURE_DIR, { recursive: true });
  await fs.mkdir(PDF_DIR, { recursive: true });

  try {
    await fs.access(SUBMISSIONS_FILE);
  } catch {
    await fs.writeFile(SUBMISSIONS_FILE, "[]", "utf8");
  }

  localInitialized = true;
}

export async function ensureStorage(): Promise<void> {
  if (isSupabaseBackend()) {
    if (!isSupabaseStorageConfigured()) {
      throw new Error("STORAGE_BACKEND=supabase is enabled but Supabase env vars are missing.");
    }

    await ensureSupabaseStorage();
    return;
  }

  await ensureLocalStorage();
}

async function readJsonFile<T>(filePath: string, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function readSubmissionsFromLocal(): Promise<SubmissionRecord[]> {
  await ensureLocalStorage();
  const rows = await readJsonFile<SubmissionRecord[]>(SUBMISSIONS_FILE, []);

  return rows
    .map((row) => normalizeSubmissionRecord(row))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readSubmissions(): Promise<SubmissionRecord[]> {
  if (isSupabaseBackend()) {
    return readSubmissionsFromSupabase();
  }

  return readSubmissionsFromLocal();
}

export async function findSubmissionById(id: string): Promise<SubmissionRecord | null> {
  const rows = await readSubmissions();
  return rows.find((row) => row.id === id) || null;
}

async function writeSubmissions(rows: SubmissionRecord[]): Promise<void> {
  await ensureLocalStorage();
  await fs.writeFile(
    SUBMISSIONS_FILE,
    JSON.stringify(rows.map((row) => normalizeSubmissionRecord(row)), null, 2),
    "utf8",
  );
}

async function appendSubmissionToLocal(row: SubmissionRecord): Promise<void> {
  const rows = await readSubmissionsFromLocal();
  rows.unshift(normalizeSubmissionRecord(row));
  await writeSubmissions(rows);
}

export async function appendSubmission(row: SubmissionRecord): Promise<void> {
  if (isSupabaseBackend()) {
    await appendSubmissionToSupabase(normalizeSubmissionRecord(row));
    return;
  }

  await appendSubmissionToLocal(row);
}

function safeFilePath(baseDir: string, key: string): string {
  const resolvedBase = path.resolve(baseDir);
  const target = path.resolve(baseDir, key);

  if (!target.startsWith(resolvedBase + path.sep)) {
    throw new Error("Invalid storage path");
  }

  return target;
}

export async function saveSignaturePng(submissionId: string, buffer: Buffer): Promise<string> {
  if (isSupabaseBackend()) {
    return saveSignatureToSupabase(submissionId, buffer);
  }

  await ensureLocalStorage();
  const key = `${submissionId}.png`;
  const target = safeFilePath(SIGNATURE_DIR, key);
  await fs.writeFile(target, buffer);
  return `signatures/${key}`;
}

export async function saveWaiverPdf(submissionId: string, buffer: Buffer): Promise<string> {
  if (isSupabaseBackend()) {
    return saveWaiverPdfToSupabase(submissionId, buffer);
  }

  await ensureLocalStorage();
  const key = `${submissionId}.pdf`;
  const target = safeFilePath(PDF_DIR, key);
  await fs.writeFile(target, buffer);
  return `pdfs/${key}`;
}

export async function readWaiverPdf(key: string): Promise<Buffer | null> {
  if (!key) {
    return null;
  }

  if (isSupabaseBackend()) {
    return readSupabaseFileById(key);
  }

  await ensureLocalStorage();
  const normalizedKey = key.startsWith("pdfs/") ? key.slice("pdfs/".length) : key;
  const target = safeFilePath(PDF_DIR, normalizedKey);

  try {
    return await fs.readFile(target);
  } catch {
    return null;
  }
}

export async function savePhoto(key: string, buffer: Buffer, mimeType: string): Promise<string> {
  if (isSupabaseBackend()) {
    return savePhotoToSupabase(key, buffer, mimeType);
  }

  await ensureLocalStorage();
  const target = safeFilePath(PHOTO_DIR, key);
  await fs.writeFile(target, buffer);
  return key;
}

export async function photoExists(key: string): Promise<boolean> {
  if (isSupabaseBackend()) {
    return supabasePhotoExists(key);
  }

  await ensureLocalStorage();
  const target = safeFilePath(PHOTO_DIR, key);

  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}
