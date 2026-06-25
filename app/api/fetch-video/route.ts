import { NextRequest, NextResponse } from "next/server";
import { getVideoById } from "@/lib/source";

export async function GET(req: NextRequest) {
  try {
    const idParam = req.nextUrl.searchParams.get("id");
    const id = parseInt(idParam ?? "", 10);

    if (isNaN(id) || id < 1) {
      return NextResponse.json(
        { error: "Invalid id — must be a positive integer." },
        { status: 400 }
      );
    }

    const result = await getVideoById(id);
    if (!result.found) {
      return NextResponse.json({ found: false }, { status: 404 });
    }

    return NextResponse.json({
      found: true,
      videoUrl: result.videoUrl,
      title: result.title,
    });
  } catch (err) {
    console.error("[fetch-video]", err);
    return NextResponse.json(
      { error: "Internal server error." },
      { status: 500 }
    );
  }
}
