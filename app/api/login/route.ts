import { NextRequest, NextResponse } from "next/server";
import { createHash, createHmac, timingSafeEqual } from "crypto";
import { AUTH_COOKIE, AUTH_MESSAGE } from "@/lib/auth-shared";
import { kv } from "@/lib/store";

export const dynamic = "force-dynamic";

const MAX_FAILS = 10;
const LOCK_SECONDS = 15 * 60;

const sha256 = (s: string) => createHash("sha256").update(s).digest();

function clientIp(req: NextRequest) {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}

export async function POST(req: NextRequest) {
  const password = process.env.SITE_PASSWORD;
  if (!password) {
    return NextResponse.json({ error: "Er is nog geen wachtwoord ingesteld (SITE_PASSWORD)." }, { status: 503 });
  }

  const failKey = `login_fail:${clientIp(req)}`;
  const fails = (await kv.get<number>(failKey).catch(() => 0)) ?? 0;
  if (fails >= MAX_FAILS) {
    return NextResponse.json({ error: "Te veel foute pogingen. Probeer het over 15 minuten opnieuw." }, { status: 429 });
  }

  const { code } = (await req.json().catch(() => ({}))) as { code?: string };
  const ok = typeof code === "string" && timingSafeEqual(sha256(code), sha256(password));

  if (!ok) {
    await kv.set(failKey, fails + 1, { ex: LOCK_SECONDS }).catch(() => {});
    await new Promise((r) => setTimeout(r, 1000));
    return NextResponse.json({ error: "Onjuiste code." }, { status: 401 });
  }

  await kv.del(failKey).catch(() => {});
  const res = NextResponse.json({ ok: true });
  res.cookies.set(AUTH_COOKIE, createHmac("sha256", password).update(AUTH_MESSAGE).digest("hex"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(AUTH_COOKIE);
  return res;
}
