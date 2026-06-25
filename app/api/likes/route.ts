import { NextRequest, NextResponse } from "next/server";
import { kv } from "@vercel/kv";
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
    if (!body.id || !body.videoUrl || !body.title) {
      return NextResponse.json({ error: "Missing required fields." }, { status: 400 });
    }

    const likes = await readLikes();
    const exists = likes.some((v) => v.id === body.id);
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
    const { id } = (await req.json()) as { id: number };
    if (!id) {
      return NextResponse.json({ error: "Missing id." }, { status: 400 });
    }

    const likes = await readLikes();
    const updated = likes.filter((v) => v.id !== id);
    await writeLikes(updated);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[likes DELETE]", err);
    return NextResponse.json({ error: "Failed to remove like." }, { status: 500 });
  }
}
