import type { Metadata } from "next";
import { Geist, Geist_Mono, Schoolbell } from "next/font/google";
import ImageCacheRegistration from "./ImageCacheRegistration";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const schoolbell = Schoolbell({
  variable: "--font-chalk",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "Beau School Dashboard",
  description: "A private dashboard for Beau's Canvas school information.",
  manifest: "/school/manifest.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <head>
        <link rel="preload" as="image" href="/school/menu-todo.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/menu-classes.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/menu-inbox.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/menu-calendar.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/menu-notes.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/menu-chat.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/menu-inspiration.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/menu-resources.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/menu-stats.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/menu-admin.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/menu-popup-bg.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/see-in-canvas.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/announcement-got-it.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/announcements-title.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/announcements-underline.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/announcement-view.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/announcement-listen.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/assignment-details-play.webp" type="image/webp" />
        <link rel="preload" as="image" href="/school/assignment-details-pause.webp" type="image/webp" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${schoolbell.variable} antialiased`}
      >
        <ImageCacheRegistration />
        {children}
      </body>
    </html>
  );
}
