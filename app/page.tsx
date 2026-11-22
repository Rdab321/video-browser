"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { LikedVideo } from "@/lib/types";
import styles from "./page.module.css";

type FetchResult =
  | { found: true; videoUrl: string; title: string }
  | { found: false };

interface BatchResult {
  id: number;
  found: boolean;
  videoUrl?: string;
  title?: string;
}

const TEMPLATE_LS_KEY = "vb_url_template";

function lsGet(): { prefix: string; suffix: string } {
  try {
    const raw = localStorage.getItem(TEMPLATE_LS_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { prefix: "", suffix: "" };
}

function lsSet(t: { prefix: string; suffix: string }) {
  try { localStorage.setItem(TEMPLATE_LS_KEY, JSON.stringify(t)); } catch {}
}

function lsClear() {
  try { localStorage.removeItem(TEMPLATE_LS_KEY); } catch {}
}

async function apiGetTemplate(): Promise<{ prefix: string; suffix: string }> {
  try {
    const r = await fetch("/api/template");
    if (r.ok) return r.json();
  } catch {}
  return { prefix: "", suffix: "" };
}

async function apiSaveTemplate(t: { prefix: string; suffix: string }) {
  try {
    await fetch("/api/template", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(t) });
    lsSet(t);
  } catch {}
}

async function apiClearTemplate() {
  try {
    await fetch("/api/template", { method: "DELETE" });
    lsClear();
  } catch {}
}

async function fetchOne(id: number, prefix: string, suffix: string): Promise<BatchResult> {
  try {
    if (prefix.trim() || suffix.trim()) {
      return { id, found: true, videoUrl: `${prefix.trim()}${id}${suffix.trim()}`, title: `Video #${id}` };
    }
    const res = await fetch(`/api/fetch-video?id=${id}`);
    const data: FetchResult = await res.json();
    if (!res.ok || !data.found) return { id, found: false };
    const f = data as { found: true; videoUrl: string; title: string };
    return { id, found: true, videoUrl: f.videoUrl, title: f.title };
  } catch {
    return { id, found: false };
  }
}

// Average brightness (0–255) below this counts as "nothing visible"
const MIN_BRIGHTNESS = 25;

function isTooDark(ctx: CanvasRenderingContext2D, w: number, h: number): boolean {
  const px = ctx.getImageData(0, 0, w, h).data;
  let total = 0;
  for (let i = 0; i < px.length; i += 4) total += px[i] + px[i + 1] + px[i + 2];
  return total / (w * h * 3) < MIN_BRIGHTNESS;
}

// Try to capture a single frame from a video element at a given seek time.
// Returns a non-black data URL or null.
function captureFrame(vid: HTMLVideoElement): string | null {
  try {
    const canvas = document.createElement("canvas");
    canvas.width = vid.videoWidth || 320;
    canvas.height = vid.videoHeight || 180;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    if (isTooDark(ctx, canvas.width, canvas.height)) return null;
    return canvas.toDataURL("image/jpeg", 0.7);
  } catch {
    return null;
  }
}

// Attempt to load a video src and seek to seekTime, then capture a frame.
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
      const t = Math.min(seekTime, Math.max(0.1, vid.duration - 0.1));
      vid.currentTime = t;
    });

    vid.addEventListener("seeked", () => {
      const frame = captureFrame(vid);
      done(frame);
    });

    // Some formats fire canplay but not seeked — try playing briefly
    vid.addEventListener("canplay", () => {
      if (vid.readyState >= 2 && vid.currentTime > 0) {
        const frame = captureFrame(vid);
        if (frame) done(frame);
      }
    });

    vid.addEventListener("error", () => done(null));
    vid.src = src;
    vid.load();
  });
}

// Robustly grab a thumbnail by trying up to 10 strategies.
// Returns null only after all strategies fail (caller should show red error).
async function grabThumbnail(videoUrl: string): Promise<string | null> {
  const proxied = `/api/proxy-video?url=${encodeURIComponent(videoUrl)}`;

  // Strategies: [src, seekTime, timeoutMs]
  const strategies: [string, number, number][] = [
    [proxied, 1,    8000],   // 1 — proxy, seek 1s
    [proxied, 2,    8000],   // 2 — proxy, seek 2s
    [proxied, 0.1,  8000],   // 3 — proxy, seek 0.1s (very start)
    [videoUrl, 1,   8000],   // 4 — direct URL, seek 1s
    [proxied, 5,    10000],  // 5 — proxy, seek 5s
    [videoUrl, 0.5, 8000],   // 6 — direct URL, seek 0.5s
    [proxied, 0.5,  10000],  // 7 — proxy, seek 0.5s
    [videoUrl, 2,   10000],  // 8 — direct URL, seek 2s
    [proxied, 3,    12000],  // 9 — proxy, seek 3s
    [videoUrl, 5,   12000],  // 10 — direct URL, seek 5s
  ];

  for (const [src, seekTime, timeout] of strategies) {
    const result = await attemptCapture(src, seekTime, timeout);
    if (result) return result;
  }
  return null; // all 10 failed → caller shows red
}

// Check that a stored thumbnail actually shows something (loads and is not all black).
function isThumbVisible(src: string): Promise<boolean> {
  if (!src || src === "error") return Promise.resolve(false);
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      try {
        const c = document.createElement("canvas");
        c.width = 32; c.height = 18;
        const ctx = c.getContext("2d");
        if (!ctx) return resolve(true);
        ctx.drawImage(img, 0, 0, 32, 18);
        resolve(!isTooDark(ctx, 32, 18));
      } catch {
        resolve(true);
      }
    };
    img.onerror = () => resolve(false);
    img.src = src;
  });
}

export default function Home() {
  const [videoId, setVideoId] = useState(1);
  const [status, setStatus] = useState<"idle" | "loading" | "found" | "notfound" | "error">("idle");
  const [video, setVideo] = useState<{ url: string; title: string } | null>(null);
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [likedVideos, setLikedVideos] = useState<LikedVideo[]>([]);
  const [likeLoading, setLikeLoading] = useState(false);

  const [showSettings, setShowSettings] = useState(false);
  const [urlPrefix, setUrlPrefix] = useState("");
  const [urlSuffix, setUrlSuffix] = useState("");
  const [templateReady, setTemplateReady] = useState(false);

  const [batchResults, setBatchResults] = useState<BatchResult[]>([]);
  const [batchLoading, setBatchLoading] = useState(false);
  const [thumbnails, setThumbnails] = useState<Record<number, string>>({});
  // Liked-card thumb state: "checking" while verifying/regenerating, "error" after 10 failed attempts
  const [likedThumbState, setLikedThumbState] = useState<Record<number, "checking" | "ok" | "error">>({});

  const videoRef = useRef<HTMLVideoElement>(null);
  // Keep latest prefix/suffix in refs so the auto-fetch effect sees fresh values
  const prefixRef = useRef("");
  const suffixRef = useRef("");

  // Load template: use localStorage immediately for fast render, then sync from KV
  useEffect(() => {
    const local = lsGet();
    setUrlPrefix(local.prefix);
    setUrlSuffix(local.suffix);
    prefixRef.current = local.prefix;
    suffixRef.current = local.suffix;
    setTemplateReady(true);

    // Hydrate from KV in background (authoritative across devices)
    apiGetTemplate().then((remote) => {
      setUrlPrefix(remote.prefix);
      setUrlSuffix(remote.suffix);
      prefixRef.current = remote.prefix;
      suffixRef.current = remote.suffix;
      lsSet(remote);
    });
  }, []);

  // Auto-fetch 10 on mount once template is loaded
  useEffect(() => {
    if (!templateReady) return;
    runBatch(1, prefixRef.current, suffixRef.current);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [templateReady]);

  useEffect(() => {
    fetch("/api/likes")
      .then((r) => r.json())
      .then((data) => {
        if (data.likes) {
          setLikedVideos(data.likes);
          setLiked(new Set(data.likes.map((v: LikedVideo) => v.id)));
        }
      })
      .catch(() => {});
  }, []);

  // Generate thumbnails for newly-found batch results
  useEffect(() => {
    for (const r of batchResults) {
      if (!r.found || !r.videoUrl || thumbnails[r.id] !== undefined) continue;
      // Mark slot as "pending" (empty string) to avoid double-fetching
      setThumbnails((prev) => ({ ...prev, [r.id]: "" }));
      grabThumbnail(r.videoUrl).then((dataUrl) => {
        // null = all 10 attempts failed → store special "error" marker
        setThumbnails((prev) => ({ ...prev, [r.id]: dataUrl ?? "error" }));
      });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [batchResults]);

  // Make sure every saved video has a visible thumbnail; regenerate and persist if not
  useEffect(() => {
    for (const v of likedVideos) {
      if (likedThumbState[v.id]) continue;
      setLikedThumbState((p) => ({ ...p, [v.id]: "checking" }));
      (async () => {
        if (await isThumbVisible(v.thumbnail)) {
          setLikedThumbState((p) => ({ ...p, [v.id]: "ok" }));
          return;
        }
        const fresh = await grabThumbnail(v.videoUrl);
        if (!fresh) {
          setLikedThumbState((p) => ({ ...p, [v.id]: "error" }));
          return;
        }
        setLikedVideos((prev) => prev.map((x) => (x.id === v.id ? { ...x, thumbnail: fresh } : x)));
        setLikedThumbState((p) => ({ ...p, [v.id]: "ok" }));
        fetch("/api/likes", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: v.id, thumbnail: fresh }),
        }).catch(() => {});
      })();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [likedVideos]);

  const runBatch = useCallback(async (startId: number, prefix: string, suffix: string) => {
    setBatchLoading(true);
    setBatchResults([]);
    setThumbnails({});
    setStatus("idle");
    setVideo(null);

    const ids = Array.from({ length: 10 }, (_, i) => startId + i);
    await Promise.all(
      ids.map((id) =>
        fetchOne(id, prefix, suffix).then((result) => {
          setBatchResults((prev) => {
            const next = [...prev, result];
            next.sort((a, b) => a.id - b.id);
            return next;
          });
        })
      )
    );
    setBatchLoading(false);
  }, []);

  const handleFetchBatch = useCallback(() => {
    runBatch(videoId, urlPrefix, urlSuffix);
  }, [runBatch, videoId, urlPrefix, urlSuffix]);

  const handleFetch = useCallback(async () => {
    setStatus("loading");
    setVideo(null);
    setBatchResults([]);
    setThumbnails({});

    const result = await fetchOne(videoId, urlPrefix, urlSuffix);
    if (!result.found) { setStatus("notfound"); return; }
    setVideo({ url: result.videoUrl!, title: result.title! });
    setStatus("found");
  }, [videoId, urlPrefix, urlSuffix]);

  const saveTemplate = () => {
    const t = { prefix: urlPrefix, suffix: urlSuffix };
    prefixRef.current = urlPrefix;
    suffixRef.current = urlSuffix;
    apiSaveTemplate(t);
    setShowSettings(false);
    runBatch(videoId, urlPrefix, urlSuffix);
  };

  const clearTemplate = () => {
    setUrlPrefix(""); setUrlSuffix("");
    prefixRef.current = ""; suffixRef.current = "";
    apiClearTemplate();
    setShowSettings(false);
    runBatch(videoId, "", "");
  };

  const usingTemplate = urlPrefix.trim() !== "" || urlSuffix.trim() !== "";

  const isLiked = liked.has(videoId);

  const handleLike = useCallback(async () => {
    if (!video || likeLoading) return;
    const thumb = thumbnails[videoId] ?? "";
    const optimistic = !isLiked;

    setLiked((prev) => {
      const next = new Set(prev);
      optimistic ? next.add(videoId) : next.delete(videoId);
      return next;
    });
    if (optimistic) {
      const entry: LikedVideo = { id: videoId, title: video.title, videoUrl: video.url, thumbnail: thumb, likedAt: Date.now() };
      setLikedVideos((prev) => [entry, ...prev.filter((v) => v.id !== videoId)]);
    } else {
      setLikedVideos((prev) => prev.filter((v) => v.id !== videoId));
    }

    setLikeLoading(true);
    try {
      if (optimistic) {
        await fetch("/api/likes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: videoId, title: video.title, videoUrl: video.url, thumbnail: thumb }) });
      } else {
        await fetch("/api/likes", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: videoId }) });
      }
    } catch {
      setLiked((prev) => {
        const next = new Set(prev);
        optimistic ? next.delete(videoId) : next.add(videoId);
        return next;
      });
    } finally {
      setLikeLoading(false);
    }
  }, [video, likeLoading, thumbnails, isLiked, videoId]);

  const adjustId = (delta: number) => {
    const next = Math.max(1, videoId + delta);
    setVideoId(next);
    setStatus("idle");
    setVideo(null);
    runBatch(next, urlPrefix, urlSuffix);
  };

  const handleIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1) setVideoId(val);
  };

  const openFromBatch = (r: BatchResult) => {
    if (!r.found || !r.videoUrl) return;
    setVideoId(r.id);
    setVideo({ url: r.videoUrl, title: r.title! });
    setStatus("found");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const previewUrl = usingTemplate ? `${urlPrefix.trim()}${videoId}${urlSuffix.trim()}` : null;
  const foundCount = batchResults.filter((r) => r.found).length;
  const startId = batchResults[0]?.id ?? videoId;
  const endId = batchResults[batchResults.length - 1]?.id ?? videoId + 9;

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.logo}>Video Browser</h1>
        <button
          className={`${styles.settingsBtn} ${usingTemplate ? styles.settingsActive : ""}`}
          onClick={() => setShowSettings((v) => !v)}
          aria-label="URL template settings"
        >
          ⚙ {usingTemplate ? "Template on" : "URL template"}
        </button>
      </header>

      {showSettings && (
        <section className={styles.settingsPanel}>
          <p className={styles.settingsLabel}>URL template</p>
          <p className={styles.settingsHint}>The video number is inserted between prefix and suffix.</p>
          <div className={styles.templateRow}>
            <input className={styles.templateInput} placeholder="https://example.com/videos/" value={urlPrefix} onChange={(e) => setUrlPrefix(e.target.value)} spellCheck={false} />
            <span className={styles.templateNum}>{videoId}</span>
            <input className={styles.templateInput} placeholder=".mp4" value={urlSuffix} onChange={(e) => setUrlSuffix(e.target.value)} spellCheck={false} />
          </div>
          {previewUrl && <p className={styles.templatePreview} title={previewUrl}>→ {previewUrl}</p>}
          <div className={styles.settingsActions}>
            <button className={styles.fetchBtn} onClick={saveTemplate}>Save</button>
            <button className={styles.ghostBtn} onClick={clearTemplate}>Clear template</button>
            <button className={styles.ghostBtn} onClick={() => setShowSettings(false)}>Cancel</button>
          </div>
        </section>
      )}

      <section className={styles.controls}>
        <div className={styles.idRow}>
          <button className={styles.stepBtn} onClick={() => adjustId(-1)} aria-label="Previous">−</button>
          <div className={styles.idField}>
            <span className={styles.idLabel}>ID</span>
            <input type="number" min={1} value={videoId} onChange={handleIdChange} className={styles.idInput} aria-label="Video ID" />
          </div>
          <button className={styles.stepBtn} onClick={() => adjustId(1)} aria-label="Next">+</button>
        </div>

        <div className={styles.fetchRow}>
          <button className={styles.fetchBtn} onClick={handleFetchBatch} disabled={batchLoading}>
            {batchLoading ? `Fetching… (${batchResults.length}/10)` : "Fetch 10"}
          </button>
          <button className={styles.fetchBatchBtn} onClick={handleFetch} disabled={status === "loading"}>
            {status === "loading" ? "…" : "Fetch one"}
          </button>
        </div>
      </section>

      {/* Batch grid — always shown when there are results */}
      {(batchResults.length > 0 || batchLoading) && (
        <section className={styles.batchSection}>
          <div className={styles.batchHeader}>
            <h2 className={styles.sectionTitle}>
              {batchLoading
                ? `Scanning ${batchResults.length}/10…`
                : `${foundCount} found — IDs ${startId}–${endId}`}
            </h2>
            <button className={styles.ghostBtn} onClick={() => { setBatchResults([]); setThumbnails({}); }}>Clear</button>
          </div>
          <div className={styles.batchGrid}>
            {batchLoading &&
              Array.from({ length: 10 - batchResults.length }, (_, i) => (
                <div key={`ph-${i}`} className={styles.batchCard}>
                  <div className={`${styles.batchThumb} ${styles.batchThumbLoading}`} />
                  <div className={styles.batchCardMeta}><span className={styles.batchCardId}>…</span></div>
                </div>
              ))}
            {batchResults.map((r) => {
              const thumb = thumbnails[r.id];
              return (
                <button
                  key={r.id}
                  className={`${styles.batchCard} ${!r.found ? styles.batchCardMissing : ""} ${status === "found" && videoId === r.id ? styles.batchCardActive : ""}`}
                  onClick={() => openFromBatch(r)}
                  disabled={!r.found}
                  title={r.found ? r.title : `No video for ID ${r.id}`}
                >
                  <div className={`${styles.batchThumb} ${!r.found ? styles.batchThumbMissing : ""}`}>
                    {r.found && thumb && thumb !== "error" && thumb !== ""
                      // eslint-disable-next-line @next/next/no-img-element
                      ? <img src={thumb} alt={r.title} className={styles.batchThumbImg} />
                      : r.found && thumb === "error"
                        ? <div className={styles.batchThumbError}><span className={styles.batchThumbErrorIcon}>✕</span></div>
                        : r.found && (thumb === "" || thumb === undefined)
                          ? <div className={styles.batchThumbLoading} style={{ width: "100%", height: "100%" }} />
                          : <span className={styles.batchMissingIcon}>○</span>}
                  </div>
                  <div className={styles.batchCardMeta}>
                    <span className={styles.batchCardTitle}>{r.found ? r.title : "Not found"}</span>
                    <span className={styles.batchCardId}>#{r.id}</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* Player */}
      <section className={styles.player}>
        {status === "idle" && batchResults.length === 0 && (
          <div className={styles.empty}>Loading…</div>
        )}
        {status === "loading" && <div className={styles.empty}>Loading…</div>}
        {status === "error" && <div className={styles.emptyError}>Could not play this video.</div>}
        {status === "notfound" && (
          <div className={styles.empty}>
            <p className={styles.notFoundIcon}>○</p>
            <p>No video found for ID {videoId}.</p>
          </div>
        )}
        {status === "found" && video && (
          <div className={styles.videoWrapper}>
            <div className={styles.videoMeta}>
              <span className={styles.videoTitle}>{video.title}</span>
              <span className={styles.videoIdTag}>#{videoId}</span>
            </div>
            <video
              ref={videoRef}
              src={video.url}
              controls
              autoPlay
              className={styles.video}
              onError={() => setStatus("error")}
            />
            <div className={styles.videoActions}>
              <button
                className={`${styles.likeBtn} ${isLiked ? styles.liked : ""}`}
                onClick={handleLike}
                disabled={likeLoading}
              >
                {isLiked ? "♥ Liked" : "♡ Like"}
              </button>
            </div>
          </div>
        )}
      </section>

      {likedVideos.length > 0 && (
        <section className={styles.likedSection}>
          <h2 className={styles.sectionTitle}>Liked</h2>
          <div className={styles.likedGrid}>
            {likedVideos.map((v) => (
              <button
                key={v.id}
                className={styles.likedCard}
                onClick={() => {
                  setVideoId(v.id);
                  setVideo({ url: v.videoUrl, title: v.title });
                  setStatus("found");
                  setBatchResults([]);
                  setThumbnails({});
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                {likedThumbState[v.id] === "ok" && v.thumbnail
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={v.thumbnail} alt={v.title} className={styles.likedThumb} />
                  : likedThumbState[v.id] === "error"
                    ? <div className={`${styles.likedThumbPlaceholder} ${styles.batchThumbError}`}><span className={styles.batchThumbErrorIcon}>✕</span></div>
                    : <div className={`${styles.likedThumbPlaceholder} ${styles.batchThumbLoading}`} />}
                <div className={styles.likedCardMeta}>
                  <span className={styles.likedCardTitle}>{v.title}</span>
                  <span className={styles.likedCardId}>#{v.id}</span>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
