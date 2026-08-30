"use client";

import { NavTabs } from "@/app/_components/nav-tabs";

// 並びは画面定義書03 §2（セクション → プロジェクト → モード）。
// プロジェクトをモードの左に置くのは S-01/S-02/S-04 の列順と同じ理由（同書 §3 のリード文）
const TABS = [
  { href: "/masters/sections", label: "セクション" },
  { href: "/masters/projects", label: "プロジェクト" },
  { href: "/masters/modes", label: "モード" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  return pathname === href;
}

export function MasterTabs() {
  return (
    <div className="mt-4 flex gap-2 border-b border-line">
      <NavTabs tabs={TABS} isCurrent={isCurrent} />
    </div>
  );
}
