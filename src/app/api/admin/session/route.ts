import crypto from "node:crypto";

import { NextResponse } from "next/server";

import { logApi } from "@/lib/logger";
import { ADMIN_SESSION_COOKIE, isAdminTokenValid } from "@/lib/security";

export const runtime = "nodejs";

function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

export async function POST(request: Request): Promise<Response> {
  const requestId = crypto.randomUUID();
  let token = "";

  const contentType = request.headers.get("content-type") || "";
  if (contentType.includes("application/json")) {
    try {
      const body = (await request.json()) as { token?: string };
      token = (body.token || "").trim();
    } catch {
      token = "";
    }
  } else {
    const formData = await request.formData();
    token = String(formData.get("token") || "").trim();
  }

  if (!isAdminTokenValid(token)) {
    logApi("warn", "admin.session.login_failed", { requestId });
    return NextResponse.redirect(new URL("/admin?error=invalid-token", request.url), { status: 303 });
  }

  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });
  response.cookies.set(ADMIN_SESSION_COOKIE, token, sessionCookieOptions());
  logApi("info", "admin.session.login_success", { requestId });
  return response;
}
