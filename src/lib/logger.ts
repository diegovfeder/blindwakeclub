type LogLevel = "info" | "warn" | "error";

function logsEnabled(): boolean {
  if (process.env.APP_DEBUG_LOGS === "1") {
    return true;
  }

  return process.env.NODE_ENV !== "production";
}

function stringifyValue(value: unknown): unknown {
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean" || value == null) {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((item) => stringifyValue(item));
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [key, nested] of Object.entries(value)) {
      output[key] = stringifyValue(nested);
    }
    return output;
  }

  return String(value);
}

export function logApi(level: LogLevel, event: string, metadata: Record<string, unknown> = {}): void {
  if (!logsEnabled()) {
    return;
  }

  const line = `[api:${level}] ${event}`;
  const sanitized = stringifyValue(metadata);
  const details: Record<string, unknown> = {
    ts: new Date().toISOString(),
  };

  if (sanitized && typeof sanitized === "object" && !Array.isArray(sanitized)) {
    Object.assign(details, sanitized as Record<string, unknown>);
  } else {
    details.metadata = sanitized;
  }

  if (level === "error") {
    console.error(line, details);
    return;
  }

  if (level === "warn") {
    console.warn(line, details);
    return;
  }

  console.log(line, details);
}
