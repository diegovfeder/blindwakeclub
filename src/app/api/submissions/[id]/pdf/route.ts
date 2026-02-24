import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { logApi } from "@/lib/logger";
import {
  isAdminTokenValid,
  readAdminTokenFromRequest,
  verifySubmissionPdfSignature,
} from "@/lib/security";
import { findSubmissionById, readWaiverPdf } from "@/lib/storage";

export const runtime = "nodejs";

interface RouteContext {
  params:
    | Promise<{
        id: string;
      }>
    | {
        id: string;
      };
}

function unauthorized(): Response {
  return NextResponse.json({ error: "Não autorizado para baixar este PDF." }, { status: 401 });
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const requestId = crypto.randomUUID();
  const { id } = await context.params;
  logApi("info", "submissions.pdf.start", { requestId, submissionId: id });

  const adminToken = readAdminTokenFromRequest(request);
  const isAdmin = isAdminTokenValid(adminToken);

  if (!isAdmin) {
    const url = new URL(request.url);
    const expires = Number(url.searchParams.get("expires") || "NaN");
    const sig = url.searchParams.get("sig") || "";

    if (!Number.isFinite(expires) || Date.now() > expires) {
      logApi("warn", "submissions.pdf.unauthorized_expired", { requestId, submissionId: id, expires });
      return unauthorized();
    }

    const validSignature = verifySubmissionPdfSignature({ submissionId: id, expires }, sig);
    if (!validSignature) {
      logApi("warn", "submissions.pdf.unauthorized_bad_signature", { requestId, submissionId: id });
      return unauthorized();
    }
  }

  try {
    const submission = await findSubmissionById(id);
    if (!submission) {
      logApi("warn", "submissions.pdf.not_found_submission", { requestId, submissionId: id });
      return NextResponse.json({ error: "Envio não encontrado." }, { status: 404 });
    }

    const pdfKey = submission.documents?.waiverPdfKey || "";
    if (!pdfKey) {
      logApi("warn", "submissions.pdf.not_found_key", { requestId, submissionId: id });
      return NextResponse.json({ error: "PDF do termo não está disponível para este envio." }, { status: 404 });
    }

    const pdf = await readWaiverPdf(pdfKey);
    if (!pdf) {
      logApi("warn", "submissions.pdf.not_found_blob", { requestId, submissionId: id, pdfKey });
      return NextResponse.json({ error: "PDF não encontrado no armazenamento." }, { status: 404 });
    }

    const pdfBytes = Uint8Array.from(pdf);
    logApi("info", "submissions.pdf.success", {
      requestId,
      submissionId: id,
      bytes: pdfBytes.length,
      accessMode: isAdmin ? "admin" : "signed_url",
    });

    return new Response(pdfBytes, {
      status: 200,
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="termo-${id}.pdf"`,
        "cache-control": "no-store",
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logApi("error", "submissions.pdf.internal_error", { requestId, submissionId: id, error: message });
    return NextResponse.json(
      {
        error: "Falha ao buscar PDF no storage.",
        detail: process.env.APP_DEBUG_LOGS === "1" ? message : undefined,
      },
      { status: 500 },
    );
  }
}
