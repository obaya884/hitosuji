"use client";

import { useRef, useState } from "react";
import { EllipsisIcon } from "@/app/_components/icons";
import { disabledPermanent, floatPanel, hoverSurface } from "@/app/_lib/ui";
import { useDismiss } from "@/app/_lib/use-dismiss";
import { useFlipUp } from "@/app/_lib/use-flip-up";

export type RowMenuItem = Readonly<{
  label: string;
  onSelect: () => void;
  disabled?: boolean;
  /** 打刻済みタスクの削除など、確認を挟む操作（O-8） */
  confirmMessage?: string;
}>;

/**
 * 行メニュー（S-01 の画面定義書01 O-7/O-8、S-02 の画面定義書02 §3）。
 * デイリー（S-01）では日付移動はここからのみ実行でき、ルーチン管理（S-02）では操作列の入口がこれ1つになる。
 *
 * `busy` は**保存中の一時的な無効**（00_共通 §2.5）で、メニューを**開かせないだけ**にする
 * ——項目側の `disabled`（恒久的な無効）と違い薄くしない。保存完了を待って反映する画面
 * （画面定義書02 §1）が使う。**項目側と名前を分けている**のは、同じ `disabled` だと
 * 「薄くする無効」と読み違えるため。**開いている最中に `busy` になってもパネルは閉じない**
 * （項目を押した時点でメニューは閉じるので、保存中に開いたままにはならない）
 */
export function RowMenu({
  items,
  busy,
}: Readonly<{ items: readonly RowMenuItem[]; busy?: boolean }>) {
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
        disabled={busy}
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
              // 項目の無効はすべて恒久的（ルーチン由来はルーチン化不可・中断は実行中のみ 等。
              // 一覧は `task-row.tsx`）なので条件で薄さを当てる（00_共通 §2.5）
              className={`block w-full px-3 py-1 text-left text-sub text-ink ${hoverSurface} ${
                item.disabled === true ? disabledPermanent : ""
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
