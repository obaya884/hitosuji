"use client";

import { useDismiss } from "@/app/_lib/use-dismiss";
import { floatPanel } from "@/app/_lib/ui";
import { SHORTCUTS } from "../_lib/shortcuts";

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
              <tr key={shortcut.label} className="border-b border-line last:border-0">
                <td className="w-44 py-1 pr-2 align-top font-mono text-xs">{shortcut.label}</td>
                <td className="py-1 text-ink">
                  {shortcut.description}
                  {shortcut.mnemonic !== undefined && (
                    <span className="ml-1 text-xs text-ink-muted">（{shortcut.mnemonic}）</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
