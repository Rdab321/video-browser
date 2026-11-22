import { NextRequest, NextResponse } from "next/server";
import { runScan } from "@/lib/scan";
import { resetScan } from "@/lib/store";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Daily cron: respects the wait time (1 day after a hit, 3 days after an empty block)
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(await runScan(false));
}

// "Scan now" button; { reset: true } starts over from 0
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { reset?: boolean };
  if (body.reset) await resetScan();
  return NextResponse.json(await runScan(true));
}
