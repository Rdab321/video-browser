// ============================================================
// SWAP POINT: replace getVideoById with your real source here
// ============================================================
// To integrate a real video source:
//   1. Import your API client or DB connection
//   2. Replace the SAMPLE_VIDEOS map with a real lookup
//   3. Keep the same return shape: { found, videoUrl?, title? }
// ============================================================

type VideoResult =
  | { found: true; videoUrl: string; title: string }
  | { found: false };

const SAMPLE_VIDEOS: Record<number, { videoUrl: string; title: string }> = {
  1: {
    videoUrl: "https://www.w3schools.com/html/mov_bbb.mp4",
    title: "Big Buck Bunny (short)",
  },
  2: {
    videoUrl: "https://media.w3.org/2010/05/sintel/trailer.mp4",
    title: "Sintel Trailer",
  },
  3: {
    videoUrl: "https://media.w3.org/2010/05/bunny/trailer.mp4",
    title: "Bunny Trailer",
  },
  4: {
    videoUrl: "https://media.w3.org/2010/05/video/movie_300.mp4",
    title: "Movie 300",
  },
  5: {
    videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    title: "Flower",
  },
  // IDs 6–9 intentionally return { found: false } to exercise the empty state
};

export async function getVideoById(id: number): Promise<VideoResult> {
  const video = SAMPLE_VIDEOS[id];
  if (!video) return { found: false };
  return { found: true, ...video };
}
