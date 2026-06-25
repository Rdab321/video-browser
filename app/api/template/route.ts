import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";

const KV_KEY = "url_template";

async function read(): Promise<{ prefix: string; suffix: string }> {
  try {
    const data = await kv.get<{ prefix: string; suffix: string }>(KV_KEY);
    return data ?? { prefix: "", suffix: "" };
  } catch {
    return { prefix: "", suffix: "" };
  }
}

export async function GET() {
  return NextResponse.json(await read());
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as { prefix?: string; suffix?: string };
    const template = { prefix: body.prefix ?? "", suffix: body.suffix ?? "" };
    try {
      await kv.set(KV_KEY, template);
    } catch {
      // KV not configured — silently ignore, client falls back to localStorage
    }
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}

export async function DELETE() {
  try {
    await kv.del(KV_KEY);
  } catch {}
  return NextResponse.json({ ok: true });
}
