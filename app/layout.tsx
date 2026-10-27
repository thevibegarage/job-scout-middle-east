import type { Metadata } from "next";
import "./tokens.css";
import "./iim.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Job Scout — Middle East job search",
  description: "Search Middle East jobs across several sources, rank them against your resume, and check your fit."
};

const FONTS = "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800&family=Figtree:wght@400;500;600;700&family=IBM+Plex+Mono:wght@500;600&display=swap";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en">
    <head>
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
      <link rel="stylesheet" href={FONTS} />
    </head>
    <body>{children}</body>
  </html>;
}
