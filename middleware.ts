import { NextRequest, NextResponse } from "next/server";
import { AUTH_COOKIE, AUTH_MESSAGE } from "./lib/auth-shared";

async function expectedToken(password: string) {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(AUTH_MESSAGE));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // The daily Vercel cron only calls GET /api/scan, which never forces or resets a scan
  if (pathname === "/api/scan" && req.method === "GET") return NextResponse.next();

  const password = process.env.SITE_PASSWORD;
  const token = req.cookies.get(AUTH_COOKIE)?.value;
  if (password && token && token === (await expectedToken(password))) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  }
  const login = req.nextUrl.clone();
  login.pathname = "/login";
  login.search = "";
  return NextResponse.redirect(login);
}

export const config = {
  matcher: ["/((?!login|api/login|_next/static|_next/image|favicon.ico).*)"],
};
