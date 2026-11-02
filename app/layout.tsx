import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Luma Studio — AI Receptionist",
  description:
    "Ask about services, check live availability, and book an appointment with Luma, the AI receptionist at Luma Studio.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
