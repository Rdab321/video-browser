import { NextResponse } from "next/server";
import { getState, getVideos } from "@/lib/store";

export const dynamic = "force-dynamic";

export async function GET() {
  const [videos, state] = await Promise.all([getVideos(), getState()]);
  return NextResponse.json({ videos, state });
}
