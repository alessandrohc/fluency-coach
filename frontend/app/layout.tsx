import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Fluency Coach",
  description: "Local-first English speaking coach for technical interviews",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}

