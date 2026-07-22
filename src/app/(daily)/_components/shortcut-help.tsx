"use client";

import { useDismiss } from "@/app/_lib/use-dismiss";
import { floatPanel } from "@/app/_lib/ui";

// 画面定義書01 §6 の一覧と対応させる（変更時は仕様書を先に更新する）
// mnemonic は同§6 本表の括弧書き（Add / Rename / Estimate / Begin / Finish / Current / Section / Yank / Undo）と一致させる。
// 表にない由来は創作しない（該当なしのキーは mnemonic を付けない）。
const SHORTCUTS = [
  { keys: "J / K", description: "選択行の移動" },
  { keys: "C", description: "現在地へジャンプ（実行中、なければ最初の未実行）", mnemonic: "Current" },
  { keys: "Enter", description: "開始 →（実行中なら）終了 のトグル。完了タスクは複製して開始" },
  { keys: "I", description: "中断（実行中タスクのみ）" },
  { keys: "A", description: "クイック追加欄へフォーカス", mnemonic: "Add" },
  { keys: "R / F2", description: "タスク名編集", mnemonic: "Rename" },
  { keys: "E", description: "見積もり編集", mnemonic: "Estimate" },
  { keys: "B / F", description: "開始時刻 / 終了時刻の修正", mnemonic: "Begin / Finish" },
  { keys: "M", description: "モードの選択" },
  { keys: "P", description: "プロジェクトの選択" },
  { keys: "S", description: "セクションの選択", mnemonic: "Section" },
  { keys: "Shift+J / Shift+K", description: "タスクの並び替え（下へ / 上へ）" },
  { keys: "Y", description: "選択タスクの複製", mnemonic: "Yank" },
  { keys: "D", description: "削除" },
  { keys: "U", description: "取り消し（削除の取り消しを優先。なければ実行中選択中は開始打刻）", mnemonic: "Undo" },
  { keys: "Shift+H / Shift+L / T", description: "前日 / 翌日 / 今日へ移動" },
  { keys: "?", description: "この一覧の表示・非表示" },
] as const;

type Props = Readonly<{ onClose: () => void }>;

export function ShortcutHelp({ onClose }: Props) {
  // Esc で閉じる（外側クリックは下のスクリムの onClick が扱うため ref は渡さない）
  useDismiss(null, onClose);

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
                <td className="py-1 text-ink">
                  {shortcut.description}
                  {"mnemonic" in shortcut && (
                    <span className="ml-1 text-xs text-ink-muted">（{shortcut.mnemonic}）</span>
                  )}
                </td>
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
