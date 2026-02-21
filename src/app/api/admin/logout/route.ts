import { NextResponse } from "next/server";

import { ADMIN_SESSION_COOKIE } from "@/lib/security";

export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const response = NextResponse.redirect(new URL("/admin", request.url), { status: 303 });

  response.cookies.set(ADMIN_SESSION_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });

  return response;
}
