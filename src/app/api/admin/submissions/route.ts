import { NextResponse } from "next/server";

import { isAdminTokenValid, readAdminTokenFromRequest } from "@/lib/security";
import { readSubmissions } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  const token = readAdminTokenFromRequest(request);
  if (!isAdminTokenValid(token)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const submissions = await readSubmissions();
  return NextResponse.json({ submissions });
}
