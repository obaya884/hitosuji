"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

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
  const pathname = usePathname();

  return (
    <header className="border-b border-gray-200">
      <nav className="mx-auto flex max-w-4xl gap-1 px-4">
        {NAV_ITEMS.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            aria-current={isCurrent(pathname, item.href) ? "page" : undefined}
            className={`border-b-2 px-3 py-2 text-sm ${
              isCurrent(pathname, item.href)
                ? "border-gray-900 font-medium"
                : "border-transparent text-gray-500 hover:text-gray-900"
            }`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
