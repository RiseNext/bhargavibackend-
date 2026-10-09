import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

/**
 * Root layout for the backend application.
 *
 * This repo's only rendered surface is the authenticated admin UI. It is
 * deliberately plain: the public website's design lives in the frontend repo and
 * D-010 forbids touching it, so nothing here shares or imitates its styling.
 */
export const metadata: Metadata = {
  title: "Bhargavi Health World — Admin",
  // Belt and braces alongside the X-Robots-Tag header and robots.txt.
  robots: { index: false, follow: false, nocache: true },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
