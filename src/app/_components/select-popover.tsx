"use client";

import { useEffect, useRef } from "react";

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
  const ref = useRef<HTMLDivElement>(null);

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
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="absolute z-10 mt-1 max-h-64 w-48 overflow-y-auto rounded border border-gray-300 bg-white py-1 shadow-lg"
    >
      {options.map((option) => (
        <button
          key={option.id ?? "none"}
          type="button"
          onClick={() => {
            onSelect(option.id);
            onClose();
          }}
          className={`flex w-full items-center gap-2 px-3 py-1 text-left text-sm hover:bg-gray-100 ${
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
          <span className={option.id === null ? "text-gray-500" : ""}>{option.label}</span>
          {option.id === selectedId && <span className="ml-auto text-xs">✓</span>}
        </button>
      ))}
    </div>
  );
}
