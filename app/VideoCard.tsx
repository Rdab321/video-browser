"use client";

import { useEffect, useRef, useState } from "react";
import { grabThumbnail, imageLooksEmpty, withSlot } from "@/lib/thumbs";
import styles from "./page.module.css";

interface Props {
  id: number;
  url: string;
  isNew?: boolean;
  liked?: boolean;
  active?: boolean;
  initialThumb?: string;
  onOpen: () => void;
}

const storedThumbUrl = (url: string) => `/api/thumb?url=${encodeURIComponent(url)}`;

// Thumbnail sources in order: the one saved with a like, the shared thumbnail store,
// then generating one in the browser (up to 10 attempts). Red only when all fail.
export default function VideoCard({ id, url, isNew, liked, active, initialThumb, onOpen }: Props) {
  const stage = useRef<"initial" | "stored" | "generated">(initialThumb ? "initial" : "stored");
  const [src, setSrc] = useState<string | null>(initialThumb || storedThumbUrl(url));
  const [status, setStatus] = useState<"loading" | "ok" | "error">("loading");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  const generate = async () => {
    stage.current = "generated";
    setSrc(null);
    const data = await withSlot(() => (mounted.current ? grabThumbnail(url) : Promise.resolve(null)));
    if (!mounted.current) return;
    if (!data) { setStatus("error"); return; }
    setSrc(data);
    fetch("/api/thumb", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url, thumbnail: data }),
    }).catch(() => {});
  };

  const next = () => {
    if (stage.current === "initial") {
      stage.current = "stored";
      setSrc(storedThumbUrl(url));
    } else if (stage.current === "stored") {
      generate();
    } else {
      setStatus("error");
    }
  };

  return (
    <button className={`${styles.card} ${active ? styles.cardActive : ""}`} onClick={onOpen}>
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
        {status === "error" && <span className={styles.thumbErrorIcon}>✕</span>}
        {isNew && <span className={styles.newBadge}>Nieuw</span>}
        {liked && <span className={styles.likedBadge}>♥</span>}
      </div>
      <div className={styles.cardMeta}>
        <span className={styles.cardTitle}>Video #{id}</span>
      </div>
    </button>
  );
}
