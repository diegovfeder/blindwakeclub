import { NextResponse } from "next/server";

import { submissionsToCsv } from "@/lib/csv";
import { isAdminTokenValid, readAdminTokenFromRequest } from "@/lib/security";
import { readSubmissions } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const token = readAdminTokenFromRequest(request);
  if (!isAdminTokenValid(token)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const submissions = await readSubmissions();
  const csv = submissionsToCsv(submissions);

  return new Response(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="envios-termos-${Date.now()}.csv"`,
      "cache-control": "no-store",
    },
  });
}
