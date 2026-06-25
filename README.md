# Video Browser

A minimal video browser built with Next.js (App Router), Vercel KV for persistence, and a dark UI inspired by Claude's design.

## Local dev

```bash
npm install
npm run dev
```

The app works immediately with mock videos (IDs 1–5). IDs 6–9 intentionally return "not found" to exercise the empty state.

## Vercel KV setup

Liked videos are persisted in Vercel KV (free tier). Without KV the app still works — likes just won't persist across sessions.

### Steps

1. Deploy to Vercel: `npx vercel` or push to a GitHub repo connected to Vercel.
2. In the Vercel dashboard → **Storage** → **Create Database** → choose **KV**.
3. Connect the KV store to your project. Vercel auto-injects the following env vars:

```
KV_URL
KV_REST_API_URL
KV_REST_API_TOKEN
KV_REST_API_READ_ONLY_TOKEN
```

4. For local dev with KV, pull the env vars:

```bash
npx vercel env pull .env.local
npm run dev
```

### Local dev without KV

If the env vars are absent, KV calls silently fail and an empty likes list is returned. The UI still works, likes just aren't persisted.

---

## SWAP POINT — replacing the mock video source

The file `lib/source.ts` contains the mock video database. It is clearly marked:

```
// SWAP POINT: replace getVideoById with your real source here
```

Replace `getVideoById(id: number)` with your real data source (database, CMS API, CDN manifest, etc.). Keep the same return shape:

```ts
type VideoResult =
  | { found: true; videoUrl: string; title: string }
  | { found: false };
```

The API route `app/api/fetch-video/route.ts` calls this function server-side, so the browser never directly contacts your video origin.

---

## Architecture

```
app/
  page.tsx               — client component: UI, state, thumbnail capture
  api/
    fetch-video/route.ts — server-side proxy to lib/source.ts
    likes/route.ts       — GET / POST / DELETE for Vercel KV
lib/
  source.ts              — SWAP POINT: mock → real video source
  types.ts               — shared TypeScript types
```
