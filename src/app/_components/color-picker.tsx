"use client";

import { useRef, useState } from "react";
import { useDismiss } from "@/app/_lib/use-dismiss";
import { floatPanel } from "@/app/_lib/ui";
import { COLOR_PRESETS } from "@/domain/shared/color-presets";

/** 新規追加行の既定色（プリセットの先頭＝赤。画面定義書03 §3.2 / 05 §4 O-1） */
export const DEFAULT_COLOR = COLOR_PRESETS[0].value;

/**
 * カラーバーを押すと開くプリセット13色の選択（画面定義書03 §3.2 / 05 §4 O-2）。
 * S-03（モード）と S-05（バンドル）が共有する部品——同じ挙動を2画面で別々に持つと
 * 片方だけ直る事故が起きるため、共通部品として独立させてある（F-119 実装時に切り出し）。
 * S-01 の SelectPopover（`(daily)/_components/select-popover.tsx`）と同じ作り
 * （floatPanel・Esc と外側クリックで閉じる）だが、候補がプリセット13色に固定される点が違う。
 */
export function ColorPickerPopover({
  selected,
  onSelect,
  onClose,
}: Readonly<{
  selected: string;
  onSelect: (color: string) => void;
  onClose: () => void;
}>) {
  const ref = useRef<HTMLDivElement>(null);
  const [hovered, setHovered] = useState<string | null>(null);

  // 外側クリック＋Esc で閉じる
  useDismiss(ref, onClose);

  return (
    <div ref={ref} className={`absolute z-10 mt-1 flex w-56 flex-wrap gap-1.5 p-2 ${floatPanel}`}>
      {COLOR_PRESETS.map(({ value, name }) => (
        <span key={value} className="relative">
          <button
            type="button"
            aria-label={`色 ${name}`}
            aria-pressed={selected === value}
            onMouseEnter={() => setHovered(value)}
            onMouseLeave={() => setHovered((c) => (c === value ? null : c))}
            onFocus={() => setHovered(value)}
            onBlur={() => setHovered((c) => (c === value ? null : c))}
            onClick={() => {
              onSelect(value);
              onClose();
            }}
            style={{ backgroundColor: value }}
            className={`block h-6 w-6 rounded-full ${
              selected === value ? "outline-solid outline-2 outline-offset-2 outline-ink" : ""
            }`}
          />
          {/* 色だけでは選びにくいので、乗せた候補の名前を吹き出しで出す（画面定義書03 §3.2） */}
          {hovered === value && (
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1 -translate-x-1/2 rounded-control bg-ink px-1.5 py-0.5 text-xs whitespace-nowrap text-paper"
            >
              {name}
            </span>
          )}
        </span>
      ))}
    </div>
  );
}
