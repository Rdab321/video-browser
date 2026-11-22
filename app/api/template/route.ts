import { NextRequest, NextResponse } from "next/server";
import { getTemplate, resetScan, setTemplate } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(await getTemplate());
}

// A different template means different videos, so the scan starts over from 0
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { prefix?: string; suffix?: string };
    const next = { prefix: body.prefix ?? "", suffix: body.suffix ?? "" };
    const current = await getTemplate();
    const changed = current.prefix !== next.prefix || current.suffix !== next.suffix;
    try {
      await setTemplate(next);
      if (changed) await resetScan();
    } catch {}
    return NextResponse.json({ ok: true, changed });
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
}
