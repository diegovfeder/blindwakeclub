import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { logApi } from "@/lib/logger";
import { isAdminTokenValid, readAdminTokenFromRequest } from "@/lib/security";
import { readSubmissions } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const token = readAdminTokenFromRequest(request);
  if (!isAdminTokenValid(token)) {
    logApi("warn", "admin.submissions.unauthorized", { requestId });
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const submissions = await readSubmissions();
    logApi("info", "admin.submissions.success", { requestId, count: submissions.length });
    return NextResponse.json({ submissions });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logApi("error", "admin.submissions.internal_error", { requestId, error: message });
    return NextResponse.json(
      {
        error: "Falha ao ler envios no storage.",
        detail: process.env.APP_DEBUG_LOGS === "1" ? message : undefined,
      },
      { status: 500 },
    );
  }
}
