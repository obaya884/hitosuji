"use client";

import { useEffect, useState } from "react";
import { CheckIcon } from "@/app/_components/icons";
import { floatPanel } from "@/app/_lib/ui";
import { useFlipUp } from "@/app/_lib/use-flip-up";

export type PopoverOption = Readonly<{
  id: number | null;
  label: string;
  /** モードのカラーバー表示に使う */
  color?: string;
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

  // 外側クリックで閉じる
  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
    // ref は useFlipUp が返す固定の参照（毎回同じオブジェクト）
  }, [onClose, ref]);

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
        setActiveIndex((i) => Math.min(options.length - 1, i + 1));
      } else if (e.key === "k") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Enter") {
        e.preventDefault();
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
          {option.id === selectedId && <CheckIcon className="ml-auto h-3 w-3 shrink-0" />}
        </button>
      ))}
    </div>
  );
}
