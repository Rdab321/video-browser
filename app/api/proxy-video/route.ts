import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  if (!url) {
    return NextResponse.json({ error: "Missing url param" }, { status: 400 });
  }

  let decoded: string;
  try {
    decoded = decodeURIComponent(url);
    new URL(decoded); // validate it's a real URL
  } catch {
    return NextResponse.json({ error: "Invalid url" }, { status: 400 });
  }

  try {
    // Forward Range header so seeking works
    const range = req.headers.get("range");
    const upstream = await fetch(decoded, {
      headers: {
        ...(range ? { Range: range } : {}),
        "User-Agent": "Mozilla/5.0 (compatible; VideoBrowser/1.0)",
      },
    });

    const headers = new Headers();
    // Forward the headers browsers need for video
    for (const key of ["content-type", "content-length", "content-range", "accept-ranges"]) {
      const val = upstream.headers.get(key);
      if (val) headers.set(key, val);
    }
    headers.set("Access-Control-Allow-Origin", "*");

    return new NextResponse(upstream.body, {
      status: upstream.status,
      headers,
    });
  } catch (err) {
    console.error("[proxy-video]", err);
    return NextResponse.json({ error: "Failed to fetch video" }, { status: 502 });
  }
}
