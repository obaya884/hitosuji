import type { Metadata } from "next";
import { HeaderNav } from "./_components/header-nav";
import "./globals.css";

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
    <html lang="ja" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <HeaderNav />
        <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
