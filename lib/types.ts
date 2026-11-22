export interface LikedVideo {
  id: number;
  title: string;
  videoUrl: string;
  thumbnail: string; // data URL, may be empty
  likedAt: number;   // unix ms
}

export interface FoundVideo {
  id: number;
  url: string;
  foundAt: number; // start time of the scan run that found it
}

export interface ScanState {
  highestFound: number;   // -1 when nothing found yet
  scannedUpTo: number;    // highest ID checked so far
  lastScanAt: number;
  nextScanAt: number;
  lastScanFound: number;  // videos found in the last run
  run: ScanRun | null;    // set while a scan is in progress (it can span several requests)
}

export interface ScanRun {
  startedAt: number;
  found: number;
  cursor: number;      // next ID to check
  windowEnd: number;   // last ID of the current block of 500
  windowHits: number;
}

// Per video URL: duration when a thumbnail is stored, failedAt after 10 failed attempts
export interface ThumbMeta {
  duration?: number;
  failedAt?: number;
}

export const RANGE_SIZE = 500;
export const THUMB_RETRY_AFTER = 3 * 24 * 60 * 60 * 1000;
