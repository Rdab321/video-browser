import { NextRequest, NextResponse } from "next/server";
import { createHash } from "crypto";
import { kv } from "@/lib/store";

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

export async function POST(req: NextRequest) {
  const { url, thumbnail } = (await req.json().catch(() => ({}))) as { url?: string; thumbnail?: string };
  if (!url || !thumbnail?.startsWith(PREFIX) || thumbnail.length > MAX_LEN) {
    return NextResponse.json({ error: "Invalid thumbnail." }, { status: 400 });
  }
  try {
    await kv.set(keyFor(url), thumbnail);
  } catch {}
  return NextResponse.json({ ok: true });
}
