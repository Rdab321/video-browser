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
}

export const RANGE_SIZE = 500;
