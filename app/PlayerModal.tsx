"use client";

import { useEffect, useRef } from "react";
import styles from "./page.module.css";

export type PlayItem = { id: number; url: string };

interface Props {
  items: PlayItem[];
  index: number;
  liked: boolean;
  onIndex: (i: number) => void;
  onClose: () => void;
  onToggleLike: () => void;
}

export default function PlayerModal({ items, index, liked, onIndex, onClose, onToggleLike }: Props) {
  const item = items[index];
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;
  const touchX = useRef<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && hasPrev) onIndex(index - 1);
      else if (e.key === "ArrowRight" && hasNext) onIndex(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, hasPrev, hasNext, onIndex, onClose]);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, []);

  if (!item) return null;

  return (
    <div
      className={styles.modalBackdrop}
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onTouchStart={(e) => { touchX.current = e.touches[0].clientX; }}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (dx > 60 && hasPrev) onIndex(index - 1);
        else if (dx < -60 && hasNext) onIndex(index + 1);
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className={styles.modal}>
        <div className={styles.modalHeader}>
          <span className={styles.videoTitle}>Video #{item.id}</span>
          <span className={styles.modalPos}>{index + 1} / {items.length}</span>
          <button className={styles.closeBtn} onClick={onClose} aria-label="Sluiten">✕</button>
        </div>
        <video key={item.url} src={item.url} controls autoPlay playsInline className={styles.modalVideo} />
        <div className={styles.modalFooter}>
          <button className={styles.ghostBtn} onClick={() => onIndex(index - 1)} disabled={!hasPrev}>‹ Vorige</button>
          <button className={`${styles.likeBtn} ${liked ? styles.liked : ""}`} onClick={onToggleLike}>
            {liked ? "♥ Bewaard" : "♡ Bewaren"}
          </button>
          <button className={styles.ghostBtn} onClick={() => onIndex(index + 1)} disabled={!hasNext}>Volgende ›</button>
        </div>
      </div>
    </div>
  );
}
