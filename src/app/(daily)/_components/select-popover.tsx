"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "@/app/_components/icons";
import { floatPanel } from "@/app/_lib/ui";
import { useDismiss } from "@/app/_lib/use-dismiss";
import { useFlipUp } from "@/app/_lib/use-flip-up";

export type PopoverOption = Readonly<{
  id: number | null;
  label: string;
  /** モードのカラーバー表示に使う */
  color?: string;
  /** 名前の右に付記する補助表記（セクションの時間帯 `開始–終了` に使う。FB-46） */
  hint?: string;
}>;

type Props = Readonly<{
  options: readonly PopoverOption[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
  onClose: () => void;
}>;

/**
 * 行の編集ポップオーバー（画面定義書01 O-5）。
 * モーダルは使わず最小限のUIにする（N-05）。キーボード（J/K で候補移動・Enter で確定・
 * Esc で取消）と外側クリックで操作する（F-112）。開いたときは現在値をハイライトする
 */
export function SelectPopover({ options, selectedId, onSelect, onClose }: Props) {
  // 画面下部の行では上向きに開く（§7「ポップオーバーの表示位置」）
  const { ref, positionClass } = useFlipUp<HTMLDivElement>();
  // 開いたときは現在値をハイライト（見つからなければ先頭）。F-112
  const [activeIndex, setActiveIndex] = useState(() =>
    Math.max(0, options.findIndex((o) => o.id === selectedId))
  );

  // 外側クリックで閉じる（Escape は下のキーナビ effect が IME 判定込みで扱うため escape:false）
  useDismiss(ref, onClose, { escape: false });

  // キーボード操作（F-112）。ポップオーバーはフォーカスを掴まないため document で拾う。
  // 表示中は背後の行操作キーが無効化される（daily-board 側で editing 中は素通し）
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return;
      // 修飾キーは使わない（00_共通 §3）。Cmd/Ctrl/Alt 併用はブラウザの既定動作へ委ねる
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "Escape") {
        onClose();
      } else if (e.key === "j") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        // 確定の Enter を背後（window）の打刻ショートカットへ伝播させない（FB-42）。
        // グローバル側は editing でガードするが、確定に伴う再レンダー／リスナー再登録の
        // タイミングでガードをすり抜けて打刻が発火するため、ここで伝播を断つ
        e.preventDefault();
        e.stopPropagation();
        const option = options[activeIndex];
        if (option !== undefined) {
          onSelect(option.id);
          onClose();
        }
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [activeIndex, options, onSelect, onClose]);

  // アクティブな候補をポップオーバーの表示領域内へスクロールする
  useEffect(() => {
    const active = ref.current?.children.item(activeIndex);
    (active as HTMLElement | null)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, ref]);

  return (
    <div
      ref={ref}
      className={`absolute z-10 max-h-64 w-48 overflow-y-auto py-1 ${positionClass} ${floatPanel}`}
    >
      {options.map((option, index) => (
        <button
          key={option.id ?? "none"}
          type="button"
          onClick={() => {
            onSelect(option.id);
            onClose();
          }}
          className={`flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-accent-weak ${
            index === activeIndex ? "bg-accent-weak" : ""
          } ${option.id === selectedId ? "font-medium" : ""}`}
        >
          {option.color !== undefined && (
            <span
              style={{ backgroundColor: option.color }}
              className="h-3 w-3 shrink-0 rounded-full"
              aria-hidden
            />
          )}
          <span className={option.id === null ? "text-ink-faint" : ""}>{option.label}</span>
          {option.hint !== undefined && (
            // 見出し §3.2 と同じ時間帯表記（弱色・等幅）で右寄せに付記する（FB-46）
            <span className="ml-auto font-mono text-xs text-ink-muted tabular-nums">
              {option.hint}
            </span>
          )}
          {option.id === selectedId && (
            // 右寄せの起点は hint があれば hint 側、なければ Check 側が担う
            <CheckIcon className={`h-3 w-3 shrink-0 ${option.hint === undefined ? "ml-auto" : ""}`} />
          )}
        </button>
      ))}
    </div>
  );
}
