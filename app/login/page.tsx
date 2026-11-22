"use client";

import { useState } from "react";
import styles from "./login.module.css";

export default function Login() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
      if (r.ok) {
        window.location.href = "/";
        return;
      }
      const d = await r.json().catch(() => ({}));
      setError(d.error ?? "Inloggen mislukt.");
      setCode("");
    } catch {
      setError("Geen verbinding.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.wrap}>
      <form className={styles.card} onSubmit={submit}>
        <h1 className={styles.title}>Video Browser</h1>
        <p className={styles.hint}>Voer de code in om verder te gaan.</p>
        <input
          className={styles.input}
          type="password"
          autoComplete="current-password"
          autoFocus
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="Code"
          aria-label="Code"
        />
        {error && <p className={styles.error}>{error}</p>}
        <button className={styles.button} type="submit" disabled={busy || !code}>
          {busy ? "Controleren…" : "Openen"}
        </button>
      </form>
    </main>
  );
}
