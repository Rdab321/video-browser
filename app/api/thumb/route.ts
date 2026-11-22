import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { kv, setThumbMeta } from "@/lib/store";

export const dynamic = "force-dynamic";

const PREFIX = "data:image/jpeg;base64,";
const MAX_LEN = 700_000;

function keyFor(url: string) {
  return `thumb:${createHash("sha1").update(url).digest("hex")}`;
}

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) return new NextResponse(null, { status: 400 });
  let data: string | null = null;
  try {
    data = await kv.get<string>(keyFor(url));
  } catch {}
  if (!data || !data.startsWith(PREFIX)) {
    return new NextResponse(null, { status: 404, headers: { "Cache-Control": "no-store" } });
  }
  return new NextResponse(Buffer.from(data.slice(PREFIX.length), "base64"), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "private, max-age=86400" },
  });
}

// { url, thumbnail, duration } stores a thumbnail; { url, failed: true } records 10 failed attempts
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    url?: string; thumbnail?: string; duration?: number; failed?: boolean;
  };
  if (!body.url) return NextResponse.json({ error: "Missing url." }, { status: 400 });

  try {
    if (body.failed) {
      await setThumbMeta(body.url, { failedAt: Date.now() });
      return NextResponse.json({ ok: true });
    }
    if (!body.thumbnail?.startsWith(PREFIX) || body.thumbnail.length > MAX_LEN) {
      return NextResponse.json({ error: "Invalid thumbnail." }, { status: 400 });
    }
    const duration = Number.isFinite(body.duration) ? Math.round(body.duration!) : 0;
    await kv.set(keyFor(body.url), body.thumbnail);
    await setThumbMeta(body.url, { duration });
  } catch {}
  return NextResponse.json({ ok: true });
}
