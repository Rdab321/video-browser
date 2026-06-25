export interface LikedVideo {
  id: number;
  title: string;
  videoUrl: string;
  thumbnail: string; // data URL
  likedAt: number;   // unix ms
}
