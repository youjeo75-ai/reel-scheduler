import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Reel Scheduler",
  description: "Schedule short-form videos to Instagram Reels, YouTube Shorts and TikTok",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
