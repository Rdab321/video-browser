"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FoundVideo, LikedVideo, RANGE_SIZE, ScanState } from "@/lib/types";
import VideoCard from "./VideoCard";
import styles from "./page.module.css";

type Tab = "discover" | "saved";
type Playing = { id: number; url: string };

const LAST_VISIT_KEY = "vb_last_visit";

function rangeTitle(i: number) {
  return `${i * RANGE_SIZE}–${(i + 1) * RANGE_SIZE}`;
}

function fmtDate(ms: number) {
  if (!ms) return "—";
  return new Date(ms).toLocaleString("nl-NL", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

export default function Home() {
  const [tab, setTab] = useState<Tab>("discover");
  const [videos, setVideos] = useState<FoundVideo[]>([]);
  const [scanState, setScanState] = useState<ScanState | null>(null);
  const [lastVisit, setLastVisit] = useState<number | null>(null);
  const [range, setRange] = useState<number | null>(null);
  const [scanning, setScanning] = useState(false);
  const [scanMsg, setScanMsg] = useState("");
  const [likes, setLikes] = useState<LikedVideo[]>([]);
  const [playing, setPlaying] = useState<Playing | null>(null);

  const [showSettings, setShowSettings] = useState(false);
  const [prefix, setPrefix] = useState("");
  const [suffix, setSuffix] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/videos", { cache: "no-store" });
    const data = (await r.json()) as { videos: FoundVideo[]; state: ScanState };
    setVideos(data.videos);
    setScanState(data.state);
    return data;
  }, []);

  const scanNow = useCallback(async (reset = false) => {
    setScanning(true);
    setScanMsg("Scannen…");
    let total = 0;
    let body: { reset?: boolean } = reset ? { reset: true } : {};
    try {
      while (true) {
        const r = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const res = (await r.json()) as { more: boolean; found: number; state: ScanState };
        body = {};
        total += res.found;
        await load();
        if (!res.more) break;
        setScanMsg(`Scannen… t/m ID ${res.state.scannedUpTo}, ${total} gevonden`);
      }
      setScanMsg(total > 0
        ? `${total} nieuwe video's gevonden`
        : "Niets nieuws gevonden. Volgende poging over 3 dagen.");
    } catch {
      setScanMsg("Scannen mislukt.");
    } finally {
      setScanning(false);
    }
  }, [load]);

  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    load().then(({ videos, state }) => {
      let stored = 0;
      try { stored = Number(localStorage.getItem(LAST_VISIT_KEY)) || 0; } catch {}
      // First visit: label the videos from the most recent scan run as new
      const newestRun = videos.reduce((m, v) => Math.max(m, v.foundAt), 0);
      setLastVisit(stored || (newestRun ? newestRun - 1 : Date.now()));
      try { localStorage.setItem(LAST_VISIT_KEY, String(Date.now())); } catch {}

      if (Date.now() >= state.nextScanAt) scanNow();
    });
    fetch("/api/likes").then((r) => r.json()).then((d) => setLikes(d.likes ?? [])).catch(() => {});
    fetch("/api/template").then((r) => r.json()).then((t) => { setPrefix(t.prefix ?? ""); setSuffix(t.suffix ?? ""); }).catch(() => {});
  }, [load, scanNow]);

  const isNew = useCallback((v: FoundVideo) => lastVisit !== null && v.foundAt > lastVisit, [lastVisit]);

  const ranges = useMemo(() => {
    const last = Math.max(0, Math.floor(Math.max(scanState?.scannedUpTo ?? 0, 0) / RANGE_SIZE));
    return Array.from({ length: last + 1 }, (_, i) => {
      const inRange = videos.filter((v) => Math.floor(v.id / RANGE_SIZE) === i);
      return { index: i, videos: inRange, newCount: inRange.filter(isNew).length };
    });
  }, [videos, scanState, isNew]);

  // Default to the highest range that has videos
  useEffect(() => {
    if (range !== null || videos.length === 0) return;
    setRange(Math.floor(videos[videos.length - 1].id / RANGE_SIZE));
  }, [videos, range]);

  const current = ranges[range ?? 0] ?? { index: 0, videos: [], newCount: 0 };
  const totalNew = ranges.reduce((n, r) => n + r.newCount, 0);
  const likedUrls = useMemo(() => new Set(likes.map((l) => l.videoUrl)), [likes]);

  const toggleLike = async (v: Playing) => {
    const wasLiked = likedUrls.has(v.url);
    const entry: LikedVideo = { id: v.id, title: `Video #${v.id}`, videoUrl: v.url, thumbnail: "", likedAt: Date.now() };
    setLikes((prev) => (wasLiked ? prev.filter((l) => l.videoUrl !== v.url) : [entry, ...prev]));
    try {
      await fetch("/api/likes", {
        method: wasLiked ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(wasLiked ? { videoUrl: v.url } : entry),
      });
    } catch {
      setLikes((prev) => (wasLiked ? [entry, ...prev] : prev.filter((l) => l.videoUrl !== v.url)));
    }
  };

  const open = (v: Playing) => {
    setPlaying(v);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const saveTemplate = async () => {
    setShowSettings(false);
    const r = await fetch("/api/template", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prefix, suffix }),
    });
    const { changed } = await r.json();
    if (changed) {
      setVideos([]);
      setRange(null);
      setPlaying(null);
      scanNow();
    }
  };

  const rescanAll = () => {
    if (!confirm("Alle gevonden video's wissen en opnieuw scannen vanaf 0?")) return;
    setShowSettings(false);
    setVideos([]);
    setRange(null);
    setPlaying(null);
    scanNow(true);
  };

  const player = playing && (
    <div className={styles.videoWrapper}>
      <div className={styles.videoMeta}>
        <span className={styles.videoTitle}>Video #{playing.id}</span>
        <button className={styles.closeBtn} onClick={() => setPlaying(null)} aria-label="Sluiten">✕</button>
      </div>
      <video key={playing.url} src={playing.url} controls autoPlay className={styles.video} />
      <div className={styles.videoActions}>
        <button
          className={`${styles.likeBtn} ${likedUrls.has(playing.url) ? styles.liked : ""}`}
          onClick={() => toggleLike(playing)}
        >
          {likedUrls.has(playing.url) ? "♥ Bewaard" : "♡ Bewaren"}
        </button>
      </div>
    </div>
  );

  return (
    <main className={styles.main}>
      <header className={styles.header}>
        <h1 className={styles.logo}>Video Browser</h1>
        <nav className={styles.tabs}>
          <button className={`${styles.tab} ${tab === "discover" ? styles.tabActive : ""}`} onClick={() => setTab("discover")}>
            Ontdekken{totalNew > 0 && <span className={styles.tabBadge}>{totalNew} nieuw</span>}
          </button>
          <button className={`${styles.tab} ${tab === "saved" ? styles.tabActive : ""}`} onClick={() => setTab("saved")}>
            Bewaard <span className={styles.tabCount}>{likes.length}</span>
          </button>
        </nav>
        <button
          className={`${styles.settingsBtn} ${showSettings ? styles.settingsActive : ""}`}
          onClick={() => setShowSettings((v) => !v)}
          aria-label="Instellingen"
        >
          ⚙
        </button>
      </header>

      {showSettings && (
        <section className={styles.settingsPanel}>
          <p className={styles.settingsLabel}>URL-template</p>
          <p className={styles.settingsHint}>Het video-nummer komt tussen het begin en het einde. Bij een nieuwe template wordt alles opnieuw gescand vanaf 0.</p>
          <div className={styles.templateRow}>
            <input className={styles.templateInput} placeholder="https://example.com/videos/" value={prefix} onChange={(e) => setPrefix(e.target.value)} spellCheck={false} />
            <span className={styles.templateNum}>123</span>
            <input className={styles.templateInput} placeholder=".mp4" value={suffix} onChange={(e) => setSuffix(e.target.value)} spellCheck={false} />
          </div>
          <div className={styles.settingsActions}>
            <button className={styles.primaryBtn} onClick={saveTemplate}>Opslaan</button>
            <button className={styles.ghostBtn} onClick={rescanAll} disabled={scanning}>Alles opnieuw scannen</button>
            <button className={styles.ghostBtn} onClick={() => setShowSettings(false)}>Annuleren</button>
          </div>
        </section>
      )}

      {tab === "discover" && (
        <>
          <section className={styles.statusBar}>
            <div className={styles.statusText}>
              <span>Gescand t/m ID <strong>{scanState && scanState.scannedUpTo >= 0 ? scanState.scannedUpTo : "—"}</strong></span>
              <span>Laatste scan {fmtDate(scanState?.lastScanAt ?? 0)}</span>
              <span>Volgende scan {scanState?.nextScanAt ? fmtDate(scanState.nextScanAt) : "zo snel mogelijk"}</span>
              {scanMsg && <span className={styles.scanMsg}>{scanMsg}</span>}
            </div>
            <button className={styles.ghostBtn} onClick={() => scanNow()} disabled={scanning}>
              {scanning ? "Bezig…" : "Nu scannen"}
            </button>
          </section>

          <nav className={styles.rangeNav}>
            {ranges.map((r) => (
              <button
                key={r.index}
                className={`${styles.rangeBtn} ${r.index === current.index ? styles.rangeBtnActive : ""} ${r.videos.length === 0 ? styles.rangeBtnEmpty : ""}`}
                onClick={() => setRange(r.index)}
              >
                {rangeTitle(r.index)}
                <span className={styles.rangeCount}>{r.videos.length}</span>
                {r.newCount > 0 && <span className={styles.rangeNew}>+{r.newCount}</span>}
              </button>
            ))}
          </nav>

          <section className={styles.pageSection}>
            <div className={styles.pageHeader}>
              <h2 className={styles.pageTitle}>{rangeTitle(current.index)}</h2>
              <span className={styles.pageSub}>
                {current.videos.length} video&apos;s{current.newCount > 0 && ` · ${current.newCount} nieuw`}
              </span>
            </div>
            {player}
            {current.videos.length === 0 ? (
              <div className={styles.empty}>
                {scanning ? "Scannen…" : "Geen video's gevonden in dit bereik."}
              </div>
            ) : (
              <div className={styles.grid}>
                {current.videos.map((v) => (
                  <VideoCard
                    key={v.url}
                    id={v.id}
                    url={v.url}
                    isNew={isNew(v)}
                    liked={likedUrls.has(v.url)}
                    active={playing?.url === v.url}
                    onOpen={() => open({ id: v.id, url: v.url })}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {tab === "saved" && (
        <section className={styles.pageSection}>
          <div className={styles.pageHeader}>
            <h2 className={styles.pageTitle}>Bewaard</h2>
            <span className={styles.pageSub}>{likes.length} video&apos;s</span>
          </div>
          {player}
          {likes.length === 0 ? (
            <div className={styles.empty}>Nog niets bewaard. Open een video en klik op ♡ Bewaren.</div>
          ) : (
            <div className={styles.grid}>
              {likes.map((l) => (
                <VideoCard
                  key={l.videoUrl}
                  id={l.id}
                  url={l.videoUrl}
                  initialThumb={l.thumbnail}
                  active={playing?.url === l.videoUrl}
                  onOpen={() => open({ id: l.id, url: l.videoUrl })}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}
