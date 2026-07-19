"use client";

import { NavTabs } from "@/app/_components/nav-tabs";

const TABS = [
  { href: "/masters/sections", label: "セクション" },
  { href: "/masters/modes", label: "モード" },
  { href: "/masters/projects", label: "プロジェクト" },
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
