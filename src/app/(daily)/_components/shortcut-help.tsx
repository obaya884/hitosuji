"use client";

import { useEffect } from "react";
import { floatPanel } from "@/app/_lib/ui";

// 画面定義書01 §6 の一覧と対応させる（変更時は仕様書を先に更新する）
const SHORTCUTS = [
  { keys: "↓ / ↑（J / K）", description: "選択行の移動" },
  { keys: "C", description: "現在地へジャンプ（実行中、なければ最初の未実行）" },
  { keys: "Enter", description: "開始 →（実行中なら）終了 のトグル" },
  { keys: "I", description: "中断（実行中タスクのみ）" },
  { keys: "N", description: "クイック追加欄へフォーカス" },
  { keys: "R / F2", description: "タスク名編集" },
  { keys: "E", description: "見積もり編集" },
  { keys: "B / F", description: "開始時刻 / 終了時刻の修正" },
  { keys: "M / P / S", description: "モード / プロジェクト / セクションの選択" },
  { keys: "Shift+J / Shift+K", description: "タスクの並び替え（下へ / 上へ）" },
  { keys: "Y", description: "選択タスクの複製" },
  { keys: "D", description: "削除" },
  { keys: "U", description: "直前の削除を取り消し" },
  { keys: "Shift+H / Shift+L / T", description: "前日 / 翌日 / 今日へ移動" },
  { keys: "?", description: "この一覧の表示・非表示" },
] as const;

type Props = Readonly<{ onClose: () => void }>;

export function ShortcutHelp({ onClose }: Props) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-30 flex items-center justify-center bg-scrim p-4"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={`max-h-full w-full max-w-md overflow-y-auto p-4 ${floatPanel}`}
      >
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-medium">キーボードショートカット</h2>
          <button type="button" onClick={onClose} className="text-xs text-ink-muted hover:underline">
            閉じる（Esc）
          </button>
        </div>
        <table className="mt-3 w-full text-sm">
          <tbody>
            {SHORTCUTS.map((shortcut) => (
              <tr key={shortcut.keys} className="border-b border-line last:border-0">
                <td className="w-44 py-1 pr-2 align-top font-mono text-xs">{shortcut.keys}</td>
                <td className="py-1 text-ink">{shortcut.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-ink-muted">
          先送りは誤操作を防ぐためショートカットを割り当てていません（行メニューから実行）。
        </p>
      </div>
    </div>
  );
}
