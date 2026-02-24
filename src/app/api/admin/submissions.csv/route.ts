import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { submissionsToCsv } from "@/lib/csv";
import { logApi } from "@/lib/logger";
import { isAdminTokenValid, readAdminTokenFromRequest } from "@/lib/security";
import { readSubmissions } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  const token = readAdminTokenFromRequest(request);
  if (!isAdminTokenValid(token)) {
    logApi("warn", "admin.submissions_csv.unauthorized", { requestId });
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  try {
    const submissions = await readSubmissions();
    const csv = submissionsToCsv(submissions);
    logApi("info", "admin.submissions_csv.success", { requestId, count: submissions.length, bytes: csv.length });

    return new Response(csv, {
      status: 200,
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="envios-termos-${Date.now()}.csv"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logApi("error", "admin.submissions_csv.internal_error", { requestId, error: message });
    return NextResponse.json(
      {
        error: "Falha ao gerar CSV no storage.",
        detail: process.env.APP_DEBUG_LOGS === "1" ? message : undefined,
      },
      { status: 500 },
    );
  }
}
