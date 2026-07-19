"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type Tab = Readonly<{ href: string; label: string }>;

// ヘッダナビとマスタタブで共有する下線タブの描画。
// アクティブ判定は呼び出し側の関数に委ねる（prefix 一致 / 完全一致）。
export function NavTabs({
  tabs,
  isCurrent,
}: Readonly<{
  tabs: readonly Tab[];
  isCurrent: (pathname: string, href: string) => boolean;
}>) {
  const pathname = usePathname();

  return (
    <>
      {tabs.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={isCurrent(pathname, tab.href) ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            isCurrent(pathname, tab.href)
              ? "border-accent font-medium text-ink"
              : "border-transparent text-ink-muted hover:text-ink"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </>
  );
}
