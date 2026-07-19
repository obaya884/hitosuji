import type { Metadata } from "next";
import { IBM_Plex_Sans_JP, IBM_Plex_Mono } from "next/font/google";
import { HeaderNav } from "./_components/header-nav";
import "./globals.css";

const plexSans = IBM_Plex_Sans_JP({
  weight: ["400", "500", "700"],
  subsets: ["latin"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Hitosuji",
  description: "タスクシュート時間術のためのシングルユーザー向けタスク管理アプリ",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ja"
      className={`h-full antialiased ${plexSans.variable} ${plexMono.variable}`}
    >
      <body className="min-h-full flex flex-col">
        <HeaderNav />
        <main className="mx-auto w-full max-w-page flex-1 px-6 py-6">{children}</main>
      </body>
    </html>
  );
}
