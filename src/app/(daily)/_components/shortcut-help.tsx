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
        // 幅は下のキー列（w-56）とセット。由来を抱えるぶん左列が長いので、パネルごと広げて説明側を痩せさせない
        className={`max-h-full w-full max-w-lg overflow-y-auto p-4 ${floatPanel}`}
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
                {/* ニーモニック由来はキーの側に置く（画面定義書01 §6）。表は列幅が内容で決まる
                    ので、w-56 だけでは折り返しを止められない（FB-107 と同型）→ nowrap で確定させる */}
                <td className="w-56 py-1 pr-2 align-top font-mono text-xs whitespace-nowrap">
                  {shortcut.label}
                  {shortcut.mnemonic !== undefined && (
                    <span className="font-sans text-ink-muted">（{shortcut.mnemonic}）</span>
                  )}
                </td>
                <td className="py-1">{shortcut.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
