import { NextRequest, NextResponse } from "next/server";

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

export function middleware(request: NextRequest) {
  const { nextUrl } = request;
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const isHttps = nextUrl.protocol === "https:" || forwardedProto === "https";

  if (process.env.NODE_ENV === "production" && !isLocalHost(nextUrl.hostname) && !isHttps) {
    return new NextResponse("HTTPS é obrigatório.", { status: 426 });
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
