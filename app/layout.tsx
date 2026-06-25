import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Video Browser",
  description: "Browse and like videos by ID",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
