"use client";

import { useRef, useState } from "react";
import { useDismiss } from "@/app/_lib/use-dismiss";
import { floatPanel } from "@/app/_lib/ui";
import { COLOR_PRESETS, colorPresetName } from "@/domain/shared/color-presets";

/** 新規追加行の既定色（プリセットの先頭＝赤。画面定義書03 §3.2 / 05 §4 O-1） */
export const DEFAULT_COLOR = COLOR_PRESETS[0].value;

/** 色見本の寸法。画面ごとの見え方の違いはここに集約する（呼び出し側に寸法クラスを書かない） */
const SWATCH_CLASS = {
  /** 名前の左に添える点（ルーチン一覧のバンドル列） */
  dot: "h-3 w-3",
  /** 幅の狭い列の帯（バンドル管理の左ペイン） */
  narrow: "h-3 w-6",
  /** 標準の帯（マスタ管理。右に色名を併記する幅） */
  bar: "h-3 w-10",
  /** 見出しの帯（バンドル管理の右ペインのヘッダ） */
  header: "h-4 w-12",
} as const;

export type ColorSwatchSize = keyof typeof SWATCH_CLASS;

/** 押せない色見本（一覧の表示専用列・アーカイブ済み一覧）。色は装飾なので読み上げから外す */
export function ColorSwatch({
  color,
  size,
  dimmed = false,
  title,
}: Readonly<{
  color: string;
  size: ColorSwatchSize;
  /** アーカイブ済み一覧のように行ごと薄く見せるとき */
  dimmed?: boolean;
  title?: string;
}>) {
  return (
    <span
      style={{ backgroundColor: color }}
      title={title}
      className={`inline-block shrink-0 rounded-control ${SWATCH_CLASS[size]} ${
        dimmed ? "opacity-50" : ""
      }`}
      aria-hidden
    />
  );
}

/**
 * 色見本を押すとプリセット選択（`ColorPickerPopover`）がその場に開くトリガー
 * （画面定義書03 §3.2 / 05 §4 O-1・O-2）。マスタ管理とバンドル管理が共有する——
 * 同じ操作を画面ごとに書き写すと、片方だけ直る事故が起きるため。
 * **開閉の状態は呼び出し側が持つ**（同じ表の中で開いているセルを1つに保つのは表の責務）
 */
export function ColorBarButton({
  color,
  action,
  size,
  showName = false,
  isPending,
  isOpen,
  onOpen,
  onSelect,
  onClose,
}: Readonly<{
  color: string;
  /** 読み上げの文言。既存の色替えは「変更」、新規追加行の色決めは「選択」 */
  action: "変更" | "選択";
  size: ColorSwatchSize;
  /** 色名を右に併記する（マスタ管理。バンドル管理は隣にバンドル名が出るので併記しない） */
  showName?: boolean;
  isPending: boolean;
  isOpen: boolean;
  onOpen: () => void;
  onSelect: (color: string) => void;
  onClose: () => void;
}>) {
  return (
    <span className={`relative inline-flex items-center ${showName ? "gap-2" : ""}`}>
      <button
        type="button"
        // 保存中は色を変えられないようにする。送信せず表示だけ変える新規追加行の選択も止める
        // （送る値と表示が食い違うため。画面定義書00_共通 §2.3「保存中に始める操作」）
        disabled={isPending}
        onClick={onOpen}
        aria-label={`色を${action}（現在: ${colorPresetName(color)}）`}
      >
        <ColorSwatch color={color} size={size} />
      </button>
      {showName && <span className="text-sm text-ink-muted">{colorPresetName(color)}</span>}
      {isOpen && <ColorPickerPopover selected={color} onSelect={onSelect} onClose={onClose} />}
    </span>
  );
}

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
