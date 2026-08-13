"use client";

import { useRef, useState } from "react";
import { EllipsisIcon } from "@/app/_components/icons";
import { floatPanel } from "@/app/_lib/ui";
import { useDismiss } from "@/app/_lib/use-dismiss";
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
  // 画面下部の行では上向きに開く（00_共通 §2.1「表示位置」）
  const { ref: panelRef, positionClass } = useFlipUp<HTMLDivElement>(open);

  // 外側クリック＋Esc で閉じる。常時マウントのため open のときだけ購読する
  useDismiss(ref, () => setOpen(false), { enabled: open });

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
              onClick={(event) => {
                // 行への伝播を止める（行内の打刻ボタンと同じ手当て。`task-row.tsx`）。
                // メニューを開いたクリックで行は既に選ばれており、伝播させると
                // 操作が動かした選択を行のクリックが後から上書きしてしまう
                event.stopPropagation();
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
