import "./globals.css";

import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono } from "next/font/google";

// Self-hosted at build time rather than fetched from the Google Fonts CDN at
// runtime, so the portal renders in its real typeface immediately and works
// with no outbound network access.
const archivo = Archivo({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-archivo",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Society EV Scheduler",
  description: "Resident, admin, and driver operations for society EV bookings.",
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      className={`${archivo.variable} ${ibmPlexMono.variable}`}
      lang="en"
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
