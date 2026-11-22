import { NextRequest, NextResponse } from "next/server";
import { kv } from "@/lib/store";
import { LikedVideo } from "@/lib/types";

const KV_KEY = "liked_videos";

async function readLikes(): Promise<LikedVideo[]> {
  try {
    const data = await kv.get<LikedVideo[]>(KV_KEY);
    return data ?? [];
  } catch {
    // KV not configured locally — return empty list so app still works
    return [];
  }
}

async function writeLikes(likes: LikedVideo[]): Promise<void> {
  try {
    await kv.set(KV_KEY, likes);
  } catch {
    // silently fail when KV not configured in local dev
  }
}

export async function GET() {
  try {
    const likes = await readLikes();
    return NextResponse.json({ likes });
  } catch (err) {
    console.error("[likes GET]", err);
    return NextResponse.json({ error: "Failed to load likes." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as LikedVideo;
    if (typeof body.id !== "number" || !body.videoUrl || !body.title) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const likes = await readLikes();
    const exists = likes.some((v) => v.videoUrl === body.videoUrl);
    if (!exists) {
      likes.unshift({ ...body, likedAt: Date.now() });
      await writeLikes(likes);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[likes POST]", err);
    return NextResponse.json({ error: "Failed to save like." }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { videoUrl } = (await req.json()) as { videoUrl?: string };
    if (!videoUrl) {
      return NextResponse.json({ error: "Missing videoUrl." }, { status: 400 });
    }

    const likes = await readLikes();
    const updated = likes.filter((v) => v.videoUrl !== videoUrl);
    await writeLikes(updated);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[likes DELETE]", err);
    return NextResponse.json({ error: "Failed to remove like." }, { status: 500 });
  }
}
