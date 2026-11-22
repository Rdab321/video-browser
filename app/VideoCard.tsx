"use client";

import { useEffect, useRef, useState } from "react";
import { ensureThumb, formatDuration, imageLooksEmpty } from "@/lib/thumbs";
import { THUMB_RETRY_AFTER, ThumbMeta } from "@/lib/types";
import styles from "./page.module.css";

interface Props {
  id: number;
  url: string;
  meta?: ThumbMeta;
  isNew?: boolean;
  seen?: boolean;
  liked?: boolean;
  initialThumb?: string;
  onOpen: () => void;
}

const storedThumbUrl = (url: string, v = 0) => `/api/thumb?url=${encodeURIComponent(url)}&v=${v}`;
const canHover = () => typeof window !== "undefined" && window.matchMedia("(hover: hover)").matches;

// Thumbnail sources in order: the one saved with a like, the stored one, then generating
// one in the browser once the card is on screen (up to 10 attempts). Red when all fail.
export default function VideoCard({ id, url, meta, isNew, seen, liked, initialThumb, onOpen }: Props) {
  const hasStored = meta?.duration !== undefined;
  const recentlyFailed = !!meta?.failedAt && Date.now() - meta.failedAt < THUMB_RETRY_AFTER;

  const stage = useRef<"initial" | "stored" | "generated">(initialThumb ? "initial" : "stored");
  const [src, setSrc] = useState<string | null>(initialThumb || (hasStored ? storedThumbUrl(url, meta?.v) : null));
  const [status, setStatus] = useState<"loading" | "ok" | "error">(
    !initialThumb && !hasStored && recentlyFailed ? "error" : "loading"
  );
  const [wantGenerate, setWantGenerate] = useState(!initialThumb && !hasStored && !recentlyFailed);
  const [inView, setInView] = useState(false);
  const [preview, setPreview] = useState(false);
  const rootRef = useRef<HTMLButtonElement>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setInView(true); io.disconnect(); }
    }, { rootMargin: "200px" });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!wantGenerate || !inView) return;
    let alive = true;
    ensureThumb(url, true).then((r) => {
      if (!alive) return;
      if (!r) { setStatus("error"); return; }
      stage.current = "generated";
      setSrc(r.image);
    });
    return () => { alive = false; };
  }, [wantGenerate, inView, url]);

  const next = () => {
    if (stage.current === "initial" && hasStored) {
      stage.current = "stored";
      setSrc(storedThumbUrl(url, meta?.v));
    } else if (stage.current !== "generated") {
      setSrc(null);
      setWantGenerate(true);
    } else {
      setStatus("error");
    }
  };

  return (
    <button
      ref={rootRef}
      className={`${styles.card} ${seen ? styles.cardSeen : ""}`}
      onClick={onOpen}
      onMouseEnter={() => {
        if (canHover()) hoverTimer.current = setTimeout(() => setPreview(true), 350);
      }}
      onMouseLeave={() => {
        clearTimeout(hoverTimer.current);
        setPreview(false);
      }}
    >
      <div className={`${styles.thumb} ${status === "loading" ? styles.shimmer : ""} ${status === "error" ? styles.thumbError : ""}`}>
        {src && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt={`Video #${id}`}
            loading="lazy"
            className={styles.thumbImg}
            style={{ opacity: status === "ok" ? 1 : 0 }}
            onLoad={(e) => {
              if (stage.current !== "generated" && imageLooksEmpty(e.currentTarget)) next();
              else setStatus("ok");
            }}
            onError={next}
          />
        )}
        {preview && (
          <video
            src={url}
            muted
            autoPlay
            loop
            playsInline
            className={styles.previewVideo}
            onLoadedMetadata={(e) => {
              const v = e.currentTarget;
              if (v.duration > 8) v.currentTime = v.duration * 0.2;
            }}
          />
        )}
        {status === "error" && <span className={styles.thumbErrorIcon}>✕</span>}
        <div className={styles.badges}>
          {isNew && !seen && <span className={styles.newBadge}>Nieuw</span>}
          {seen && <span className={styles.seenBadge}>✓ Gezien</span>}
        </div>
        {liked && <span className={styles.likedBadge}>♥</span>}
        {!!meta?.duration && <span className={styles.durationBadge}>{formatDuration(meta.duration)}</span>}
      </div>
      <div className={styles.cardMeta}>
        <span className={styles.cardTitle}>Video #{id}</span>
      </div>
    </button>
  );
}
