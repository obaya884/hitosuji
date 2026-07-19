"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/masters/sections", label: "セクション" },
  { href: "/masters/modes", label: "モード" },
  { href: "/masters/projects", label: "プロジェクト" },
] as const;

export function MasterTabs() {
  const pathname = usePathname();

  return (
    <div className="mt-4 flex gap-2 border-b border-gray-200">
      {TABS.map((tab) => (
        <Link
          key={tab.href}
          href={tab.href}
          aria-current={pathname === tab.href ? "page" : undefined}
          className={`-mb-px border-b-2 px-3 py-2 text-sm ${
            pathname === tab.href
              ? "border-gray-900 font-medium"
              : "border-transparent text-gray-500 hover:text-gray-900"
          }`}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}
