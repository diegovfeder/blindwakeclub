import crypto from "node:crypto";

function stableObject(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => stableObject(item));
  }

  if (value && typeof value === "object") {
    const sortedEntries = Object.entries(value as Record<string, unknown>)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, nested]) => [key, stableObject(nested)]);

    return Object.fromEntries(sortedEntries);
  }

  return value;
}

export function stableStringify(value: unknown): string {
  return JSON.stringify(stableObject(value));
}

export function sha256Hex(input: string | Buffer): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}
