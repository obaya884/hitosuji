"use client";

import { NavTabs } from "./nav-tabs";

// 画面定義書03 §2 のヘッダナビ（Phase 1 は デイリー / ルーチン / マスタ の3項目）
const NAV_ITEMS = [
  { href: "/", label: "デイリー" },
  { href: "/routines", label: "ルーチン" },
  { href: "/masters", label: "マスタ" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function HeaderNav() {
  return (
    <header className="border-b border-line">
      <nav className="mx-auto flex max-w-page gap-1 px-6">
        <NavTabs tabs={NAV_ITEMS} isCurrent={isCurrent} />
      </nav>
    </header>
  );
}
