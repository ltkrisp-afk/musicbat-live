import type { Metadata } from "next";
import "./globals.css";
import {PersistentRadioProvider} from '../components/persistent-radio';

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
      <body className="antialiased"><PersistentRadioProvider>{children}</PersistentRadioProvider></body>
    </html>
  );
}
