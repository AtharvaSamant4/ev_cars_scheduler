import "./globals.css";

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Society EV Scheduler",
  description: "Resident, admin, and driver operations for society EV bookings.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
