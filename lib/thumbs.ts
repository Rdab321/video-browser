// Client-side thumbnail generation: tries up to 10 strategies, rejects dark frames.

const MIN_BRIGHTNESS = 25; // average 0–255; below this the frame counts as "nothing visible"
const MAX_WIDTH = 640;

function tooDark(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const px = ctx.getImageData(0, 0, w, h).data;
  let total = 0;
  for (let i = 0; i < px.length; i += 4) total += px[i] + px[i + 1] + px[i + 2];
  return total / (w * h * 3) < MIN_BRIGHTNESS;
}

export function imageLooksEmpty(img: HTMLImageElement): boolean {
  try {
    const c = document.createElement("canvas");
    c.width = 32; c.height = 18;
    const ctx = c.getContext("2d");
    if (!ctx) return false;
    ctx.drawImage(img, 0, 0, 32, 18);
    return tooDark(ctx, 32, 18);
  } catch {
    return false;
  }
}

function captureFrame(vid: HTMLVideoElement): string | null {
  try {
    const scale = Math.min(1, MAX_WIDTH / (vid.videoWidth || MAX_WIDTH));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round((vid.videoWidth || 320) * scale);
    canvas.height = Math.round((vid.videoHeight || 180) * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    if (tooDark(ctx, canvas.width, canvas.height)) return null;
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

function attemptCapture(src: string, seekTime: number, timeout: number): Promise<string | null> {
  return new Promise((resolve) => {
    const vid = document.createElement("video");
    vid.preload = "auto";
    vid.muted = true;
    vid.playsInline = true;
    vid.crossOrigin = "anonymous";

    const cleanup = () => { try { vid.src = ""; vid.load(); } catch {} };
    const done = (result: string | null) => { clearTimeout(timer); cleanup(); resolve(result); };
    const timer = setTimeout(() => done(null), timeout);

    vid.addEventListener("loadedmetadata", () => {
      vid.currentTime = Math.min(seekTime, Math.max(0.1, vid.duration - 0.1));
    });
    vid.addEventListener("seeked", () => done(captureFrame(vid)));
    vid.addEventListener("error", () => done(null));
    vid.src = src;
    vid.load();
  });
}

export async function grabThumbnail(videoUrl: string): Promise<string | null> {
  const proxied = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}`;
  const strategies: [string, number, number][] = [
    [proxied, 1, 8000],
    [proxied, 2, 8000],
    [proxied, 0.1, 8000],
    [videoUrl, 1, 8000],
    [proxied, 5, 10000],
    [videoUrl, 0.5, 8000],
    [proxied, 0.5, 10000],
    [videoUrl, 2, 10000],
    [proxied, 3, 12000],
    [videoUrl, 5, 12000],
  ];
  for (const [src, seek, timeout] of strategies) {
    const result = await attemptCapture(src, seek, timeout);
    if (result) return result;
  }
  return null;
}

// Limit how many videos are decoded at once so a page full of cards doesn't stall the browser
let active = 0;
const waiting: (() => void)[] = [];

export async function withSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (active >= 2) await new Promise<void>((r) => waiting.push(r));
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}
