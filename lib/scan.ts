import { getVideoById } from "./source";
import { addVideos, getState, getTemplate, setState, Template } from "./store";
import { FoundVideo, RANGE_SIZE, ScanState } from "./types";

const DAY = 24 * 60 * 60 * 1000;
const RETRY_AFTER_EMPTY = 3 * DAY;
const CONCURRENCY = 25;
const CHUNK = 50;            // IDs per step; progress is saved after every step
const REQUEST_TIMEOUT = 6000;
const BUDGET_MS = 25000;     // stop starting new steps after this, well inside Vercel's 60s limit

export function buildUrl(t: Template, id: number) {
  return `${t.prefix.trim()}${id}${t.suffix.trim()}`;
}

function fetchWithTimeout(url: string, init: RequestInit) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT);
  return fetch(url, { ...init, signal: ctrl.signal, cache: "no-store" }).finally(() => clearTimeout(timer));
}

async function urlExists(url: string): Promise<boolean> {
  try {
    let r = await fetchWithTimeout(url, { method: "HEAD", redirect: "follow" });
    // Some servers refuse HEAD; ask for the first byte instead (a plain 404 needs no second try)
    if (!r.ok && r.status !== 404 && r.status !== 410) {
      r = await fetchWithTimeout(url, { headers: { Range: "bytes=0-0" }, redirect: "follow" });
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

async function scanIds(t: Template, from: number, to: number, foundAt: number): Promise<FoundVideo[]> {
  const ids = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const found: FoundVideo[] = [];
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, async () => {
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
  more: boolean;  // scan not finished yet; call again to continue
  found: number;  // found during this request
  state: ScanState;
}

// Scan forward from the highest found ID in blocks of 500. A block with hits is followed by
// the next block; an empty block ends the run (retry in 3 days, or 1 day if this run found something).
export async function runScan(force: boolean): Promise<ScanResult> {
  const startedAt = Date.now();
  const state = await getState();
  if (!force && !state.run && startedAt < state.nextScanAt) {
    return { skipped: true, more: false, found: 0, state };
  }

  const template = await getTemplate();
  if (!state.run) {
    const start = state.highestFound + 1;
    state.run = { startedAt, found: 0, cursor: start, windowEnd: start + RANGE_SIZE - 1, windowHits: 0 };
  }

  let found = 0;
  // Always do at least one step so every request makes progress
  while (state.run) {
    const run = state.run;
    const to = Math.min(run.cursor + CHUNK - 1, run.windowEnd);
    const hits = await scanIds(template, run.cursor, to, run.startedAt);
    await addVideos(hits);

    run.cursor = to + 1;
    state.scannedUpTo = Math.max(state.scannedUpTo, to);
    if (hits.length > 0) {
      found += hits.length;
      run.found += hits.length;
      run.windowHits += hits.length;
      state.highestFound = Math.max(state.highestFound, ...hits.map((h) => h.id));
    }

    if (run.cursor > run.windowEnd) {
      if (run.windowHits > 0) {
        // Next block of 500 after the highest hit, skipping IDs this run already checked
        const start = state.highestFound + 1;
        run.windowEnd = start + RANGE_SIZE - 1;
        run.cursor = Math.max(start, run.cursor);
        run.windowHits = 0;
      } else {
        state.lastScanAt = run.startedAt;
        state.lastScanFound = run.found;
        state.nextScanAt = run.startedAt + (run.found > 0 ? DAY : RETRY_AFTER_EMPTY);
        state.run = null;
      }
    }
    await setState(state);
    if (Date.now() - startedAt >= BUDGET_MS) break;
  }

  return { skipped: false, more: !!state.run, found, state };
}
