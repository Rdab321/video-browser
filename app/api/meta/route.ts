import { NextRequest, NextResponse } from "next/server";
import { getSeen, getThumbIndex, markSeen } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const [thumbs, seen] = await Promise.all([getThumbIndex(), getSeen()]);
  return NextResponse.json({ thumbs, seen });
}

// Mark a video as seen
export async function POST(req: NextRequest) {
  const { url } = (await req.json().catch(() => ({}))) as { url?: string };
  if (!url) return NextResponse.json({ error: "Missing url." }, { status: 400 });
  try {
    await markSeen(url);
  } catch {}
  return NextResponse.json({ ok: true });
}
