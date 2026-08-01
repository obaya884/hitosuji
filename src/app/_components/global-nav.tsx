"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// 全画面共通のグローバルナビ（画面定義書00_共通 §1）。
// 左サイドの Navigation Rail。アイコンは使わずラベルのみ（N-05。2026-07-20 / FB-08）
const NAV_ITEMS = [
  { href: "/", label: "デイリー" },
  { href: "/routines", label: "ルーチン" },
  { href: "/masters", label: "マスタ" },
  { href: "/review", label: "レビュー" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function GlobalNav() {
  const pathname = usePathname();

  return (
    // スクロールしても常に見えるよう固定する（画面定義書00_共通 §1「レールの固定」）。
    // flex 子は既定で伸びきり sticky が効かないため self-start ＋ 画面高で止める
    <nav className="sticky top-0 h-screen w-52 shrink-0 self-start overflow-y-auto border-r border-line px-5 py-6">
      {/* ロゴ＝ホーム。今日のデイリー（日付なしのルート）へ戻る（FB-45） */}
      <Link
        href="/"
        className="mb-6 block px-3 text-base font-bold tracking-wide text-ink"
      >
        Hitosuji
      </Link>
      <ul className="space-y-1">
        {NAV_ITEMS.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
              className={`block rounded-control px-3 py-2 text-sm ${
                isCurrent(pathname, item.href)
                  ? "bg-accent-weak font-medium text-ink"
                  : "text-ink-muted hover:text-ink"
              }`}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
