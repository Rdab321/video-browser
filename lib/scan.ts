import { getVideoById } from "./source";
import { addVideos, getState, getTemplate, setState, Template } from "./store";
import { FoundVideo, RANGE_SIZE, ScanState } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const RETRY_AFTER_EMPTY = 3 * DAY;
const CONCURRENCY = 25;

export function buildUrl(t: Template, id: number) {
  return `${t.prefix.trim()}${id}${t.suffix.trim()}`;
}

function fetchWithTimeout(url: string, init: RequestInit, ms: number) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" }).finally(() => clearTimeout(timer));
}

async function urlExists(url: string): Promise<boolean> {
  try {
    let r = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" }, 8000);
    // Some servers refuse HEAD; ask for the first byte instead
    if (!r.ok) {
      r = await fetchWithTimeout(url, { headers: { Range: "bytes=0-0" }, redirect: "follow" }, 8000);
      r.body?.cancel().catch(() => {});
    }
    if (!r.ok) return false;
    // Sites that answer every URL with an HTML page aren't real hits
    return !(r.headers.get("content-type") ?? "").includes("text/html");
  } catch {
    return false;
  }
}

async function checkId(t: Template, id: number): Promise<string | null> {
  if (t.prefix.trim() || t.suffix.trim()) {
    const url = buildUrl(t, id);
    return (await urlExists(url)) ? url : null;
  }
  const r = await getVideoById(id);
  return r.found ? r.videoUrl : null;
}

async function scanWindow(t: Template, from: number, to: number, foundAt: number): Promise<FoundVideo[]> {
  const ids = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const found: FoundVideo[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: CONCURRENCY }, async () => {
      while (next < ids.length) {
        const id = ids[next++];
        const url = await checkId(t, id);
        if (url) found.push({ id, url, foundAt });
      }
    })
  );
  return found;
}

export interface ScanResult {
  skipped: boolean;
  more: boolean;  // stopped by the time budget; call again to continue
  found: number;
  state: ScanState;
}

// Scan forward from the highest found ID in blocks of 500. Keeps going while blocks
// contain videos (so the first run catches up from 0); an empty block ends the run.
export async function runScan(force: boolean, budgetMs = 45000): Promise<ScanResult> {
  const startedAt = Date.now();
  const state = await getState();
  if (!force && startedAt < state.nextScanAt) {
    return { skipped: true, more: false, found: 0, state };
  }

  const template = await getTemplate();
  let found = 0;
  let more = false;

  while (true) {
    const from = state.highestFound + 1;
    const to = from + RANGE_SIZE - 1;
    const hits = await scanWindow(template, from, to, startedAt);
    await addVideos(hits);
    state.scannedUpTo = Math.max(state.scannedUpTo, to);

    if (hits.length === 0) break;
    found += hits.length;
    state.highestFound = Math.max(...hits.map((h) => h.id));

    if (Date.now() - startedAt > budgetMs) {
      more = true;
      break;
    }
  }

  state.lastScanAt = startedAt;
  state.lastScanFound = found;
  state.nextScanAt = more ? 0 : startedAt + (found > 0 ? DAY : RETRY_AFTER_EMPTY);
  await setState(state);
  return { skipped: false, more, found, state };
}
