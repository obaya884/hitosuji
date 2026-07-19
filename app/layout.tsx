import type { Metadata } from "next";
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
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
