// Client-side thumbnail generation: tries up to 10 strategies, rejects dark frames.

const MIN_BRIGHTNESS = 25; // average 0–255; below this the frame counts as "nothing visible"
const MAX_WIDTH = 400;
const JPEG_QUALITY = 0.6;

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
    return canvas.toDataURL("image/jpeg", JPEG_QUALITY);
  } catch {
    return null;
  }
}

export interface ThumbResult {
  image: string;
  duration: number;
}

function attemptCapture(src: string, seekTime: number, timeout: number): Promise<ThumbResult | null> {
  return new Promise((resolve) => {
    const vid = document.createElement("video");
    vid.preload = "auto";
    vid.muted = true;
    vid.playsInline = true;
    vid.crossOrigin = "anonymous";

    const cleanup = () => { try { vid.src = ""; vid.load(); } catch {} };
    const done = (result: ThumbResult | null) => { clearTimeout(timer); cleanup(); resolve(result); };
    const timer = setTimeout(() => done(null), timeout);

    vid.addEventListener("loadedmetadata", () => {
      vid.currentTime = Math.min(seekTime, Math.max(0.1, vid.duration - 0.1));
    });
    vid.addEventListener("seeked", () => {
      const image = captureFrame(vid);
      done(image ? { image, duration: Number.isFinite(vid.duration) ? vid.duration : 0 } : null);
    });
    vid.addEventListener("error", () => done(null));
    vid.src = src;
    vid.load();
  });
}

async function grabThumbnail(videoUrl: string): Promise<ThumbResult | null> {
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

// Limit how many videos are decoded at once; cards on screen jump ahead of background work
let active = 0;
const waiting: (() => void)[] = [];

async function withSlot<T>(fn: () => Promise<T>, priority: boolean): Promise<T> {
  if (active >= 2) {
    await new Promise<void>((r) => (priority ? waiting.unshift(r) : waiting.push(r)));
  }
  active++;
  try {
    return await fn();
  } finally {
    active--;
    waiting.shift()?.();
  }
}

type Listener = (url: string, result: ThumbResult | null) => void;
const listeners = new Set<Listener>();

export function onThumbDone(fn: Listener) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const inflight = new Map<string, Promise<ThumbResult | null>>();

// Generate (once per session per URL) and store a thumbnail, or record that all attempts failed
export function ensureThumb(url: string, priority = false): Promise<ThumbResult | null> {
  let p = inflight.get(url);
  if (!p) {
    p = withSlot(() => grabThumbnail(url), priority).then((result) => {
      fetch("/api/thumb", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(result
          ? { url, thumbnail: result.image, duration: result.duration }
          : { url, failed: true }),
      }).catch(() => {});
      listeners.forEach((fn) => fn(url, result));
      return result;
    });
    inflight.set(url, p);
  }
  return p;
}

export function formatDuration(sec: number): string {
  const s = Math.round(sec);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}
