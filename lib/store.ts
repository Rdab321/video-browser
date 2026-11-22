import { createClient } from "@vercel/kv";
import { FoundVideo, ScanState } from "./types";

const kvUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const kvToken = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

// In-memory stand-in for local dev without a database (data is lost on restart)
const g = globalThis as { __vbMem?: Map<string, unknown> };
const mem = (g.__vbMem ??= new Map<string, unknown>());
const memoryKv = {
  async get<T>(k: string) { return (mem.get(k) as T) ?? null; },
  async set(k: string, v: unknown) { mem.set(k, v); return "OK"; },
  async del(k: string) { mem.delete(k); return 1; },
  async hgetall<T>(k: string) { return (mem.get(k) as T) ?? null; },
  async hset(k: string, obj: Record<string, unknown>) {
    mem.set(k, { ...((mem.get(k) as object) ?? {}), ...obj });
    return Object.keys(obj).length;
  },
};

type Kv = Pick<ReturnType<typeof createClient>, "get" | "set" | "del" | "hgetall" | "hset">;

export const kv: Kv = kvUrl && kvToken
  ? createClient({ url: kvUrl, token: kvToken })
  : (memoryKv as unknown as Kv);

const TEMPLATE_KEY = "url_template";
const STATE_KEY = "scan_state";
const VIDEOS_KEY = "found_videos";

export type Template = { prefix: string; suffix: string };

export const INITIAL_STATE: ScanState = {
  highestFound: -1,
  scannedUpTo: -1,
  lastScanAt: 0,
  nextScanAt: 0,
  lastScanFound: 0,
};

export async function getTemplate(): Promise<Template> {
  try {
    return (await kv.get<Template>(TEMPLATE_KEY)) ?? { prefix: "", suffix: "" };
  } catch {
    return { prefix: "", suffix: "" };
  }
}

export async function setTemplate(t: Template) {
  await kv.set(TEMPLATE_KEY, t);
}

export async function getState(): Promise<ScanState> {
  try {
    return { ...INITIAL_STATE, ...((await kv.get<ScanState>(STATE_KEY)) ?? {}) };
  } catch {
    return INITIAL_STATE;
  }
}

export async function setState(s: ScanState) {
  await kv.set(STATE_KEY, s);
}

export async function getVideos(): Promise<FoundVideo[]> {
  try {
    const all = await kv.hgetall<Record<string, FoundVideo>>(VIDEOS_KEY);
    return Object.values(all ?? {}).sort((a, b) => a.id - b.id);
  } catch {
    return [];
  }
}

export async function addVideos(videos: FoundVideo[]) {
  if (videos.length === 0) return;
  await kv.hset(VIDEOS_KEY, Object.fromEntries(videos.map((v) => [String(v.id), v])));
}

export async function resetScan() {
  await kv.del(VIDEOS_KEY);
  await setState(INITIAL_STATE);
}
