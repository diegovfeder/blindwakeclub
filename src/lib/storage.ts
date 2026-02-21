import fs from "node:fs/promises";
import path from "node:path";

import {
  appendSubmissionToGoogle,
  ensureGoogleStorage,
  googlePhotoExists,
  isGoogleStorageConfigured,
  readSubmissionsFromGoogle,
  savePhotoToGoogle,
  saveSignatureToGoogle,
} from "@/lib/google-storage";
import type { SubmissionRecord } from "@/lib/types";

const DATA_DIR = path.join(process.cwd(), "data");
const SUBMISSIONS_FILE = path.join(DATA_DIR, "submissions.json");
const PHOTO_DIR = path.join(DATA_DIR, "photos");
const SIGNATURE_DIR = path.join(DATA_DIR, "signatures");

type StorageBackend = "local" | "google";

let localInitialized = false;

function readStorageBackend(): StorageBackend {
  const configured = (process.env.STORAGE_BACKEND || "local").trim().toLowerCase();
  if (configured === "google") {
    return "google";
  }

  return "local";
}

function isGoogleBackend(): boolean {
  return readStorageBackend() === "google";
}

async function ensureLocalStorage(): Promise<void> {
  if (localInitialized) {
    return;
  }

  await fs.mkdir(PHOTO_DIR, { recursive: true });
  await fs.mkdir(SIGNATURE_DIR, { recursive: true });

  try {
    await fs.access(SUBMISSIONS_FILE);
  } catch {
    await fs.writeFile(SUBMISSIONS_FILE, "[]", "utf8");
  }

  localInitialized = true;
}

export async function ensureStorage(): Promise<void> {
  if (isGoogleBackend()) {
    if (!isGoogleStorageConfigured()) {
      throw new Error("STORAGE_BACKEND=google is enabled but Google env vars are missing.");
    }

    await ensureGoogleStorage();
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

  return rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function readSubmissions(): Promise<SubmissionRecord[]> {
  if (isGoogleBackend()) {
    return readSubmissionsFromGoogle();
  }

  return readSubmissionsFromLocal();
}

async function writeSubmissions(rows: SubmissionRecord[]): Promise<void> {
  await ensureLocalStorage();
  await fs.writeFile(SUBMISSIONS_FILE, JSON.stringify(rows, null, 2), "utf8");
}

async function appendSubmissionToLocal(row: SubmissionRecord): Promise<void> {
  const rows = await readSubmissionsFromLocal();
  rows.unshift(row);
  await writeSubmissions(rows);
}

export async function appendSubmission(row: SubmissionRecord): Promise<void> {
  if (isGoogleBackend()) {
    await appendSubmissionToGoogle(row);
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
  if (isGoogleBackend()) {
    return saveSignatureToGoogle(submissionId, buffer);
  }

  await ensureLocalStorage();
  const key = `${submissionId}.png`;
  const target = safeFilePath(SIGNATURE_DIR, key);
  await fs.writeFile(target, buffer);
  return `signatures/${key}`;
}

export async function savePhoto(key: string, buffer: Buffer, mimeType: string): Promise<string> {
  if (isGoogleBackend()) {
    return savePhotoToGoogle(key, buffer, mimeType);
  }

  await ensureLocalStorage();
  const target = safeFilePath(PHOTO_DIR, key);
  await fs.writeFile(target, buffer);
  return key;
}

export async function photoExists(key: string): Promise<boolean> {
  if (isGoogleBackend()) {
    return googlePhotoExists(key);
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
