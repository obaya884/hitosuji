"use client";

import { useEffect } from "react";
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
 * モーダルは使わず最小限のUIにする（N-05）。Esc と外側クリックで閉じる
 */
export function SelectPopover({ options, selectedId, onSelect, onClose }: Props) {
  // 画面下部の行では上向きに開く（§7「ポップオーバーの表示位置」）
  const { ref, positionClass } = useFlipUp<HTMLDivElement>();

  useEffect(() => {
    function onPointerDown(e: MouseEvent) {
      if (ref.current !== null && !ref.current.contains(e.target as Node)) onClose();
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
    // ref は useFlipUp が返す固定の参照（毎回同じオブジェクト）
  }, [onClose, ref]);

  return (
    <div
      ref={ref}
      className={`absolute z-10 max-h-64 w-48 overflow-y-auto py-1 ${positionClass} ${floatPanel}`}
    >
      {options.map((option) => (
        <button
          key={option.id ?? "none"}
          type="button"
          onClick={() => {
            onSelect(option.id);
            onClose();
          }}
          className={`flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-accent-weak ${
            option.id === selectedId ? "font-medium" : ""
          }`}
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
