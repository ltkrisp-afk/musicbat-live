import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MusicBat — Minimum Working Loop",
  description: "Independent artists enter Radio. Listener choices shape the Shock Room.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
