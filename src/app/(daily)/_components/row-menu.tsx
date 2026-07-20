"use client";

import { useEffect, useRef, useState } from "react";
import { EllipsisIcon } from "@/app/_components/icons";
import { floatPanel } from "@/app/_lib/ui";
import { useFlipUp } from "@/app/_lib/use-flip-up";

export type RowMenuItem = Readonly<{
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** 打刻済みタスクの削除など、確認を挟む操作（O-8） */
  confirmMessage?: string;
}>;

/** 行メニュー（画面定義書01 O-7/O-8）。先送りはここからのみ実行できる */
export function RowMenu({ items }: Readonly<{ items: readonly RowMenuItem[] }>) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // 画面下部の行では上向きに開く（§7「ポップオーバーの表示位置」）
  const { ref: panelRef, positionClass } = useFlipUp<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(e: MouseEvent) {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label="行メニュー"
        onClick={() => setOpen((v) => !v)}
        className="px-1 py-1 text-ink-faint hover:text-ink"
      >
        <EllipsisIcon />
      </button>
      {open && (
        <div ref={panelRef} className={`absolute right-0 z-10 w-36 py-1 ${positionClass} ${floatPanel}`}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              disabled={item.disabled}
              onClick={() => {
                if (item.confirmMessage !== undefined && !window.confirm(item.confirmMessage)) {
                  return;
                }
                item.onSelect();
                setOpen(false);
              }}
              className="block w-full px-3 py-1 text-left text-sm text-ink hover:bg-accent-weak disabled:text-ink-faint disabled:hover:bg-transparent"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
