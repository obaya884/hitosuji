"use client";

import { useState, useTransition } from "react";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { MODE_COLORS, type Mode } from "@/domain/mode/mode";
import type { ActionResult } from "../_lib/action-result";
import { createModeAction, setModeArchivedAction, updateModeAction } from "./actions";

type Props = Readonly<{
  active: readonly Mode[];
  archived: readonly Mode[];
}>;

type Editing = Readonly<{ id: number | "new"; name: string; color: string }>;

export function ModesTable({ active, archived }: Props) {
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onSuccess?.();
      else setError(result.message);
    });
  }

  function save() {
    if (editing === null) return;
    const input = { name: editing.name, color: editing.color };
    const action =
      editing.id === "new"
        ? () => createModeAction(input)
        : () => updateModeAction(editing.id as number, input);
    run(action, () => setEditing(null));
  }

  const onKeyDown = inlineEditKeyHandler({ onEnter: save, onEscape: () => setEditing(null) });

  const editRow = (key: string) => (
    <tr key={key} className="border-b border-gray-100">
      <td className="py-1 pr-2">
        <div className="flex flex-wrap gap-1">
          {MODE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              aria-label={`色 ${color}`}
              aria-pressed={editing?.color === color}
              onClick={() => setEditing((s) => (s === null ? s : { ...s, color }))}
              style={{ backgroundColor: color }}
              className={`h-5 w-5 rounded-full ${
                editing?.color === color ? "ring-2 ring-gray-900 ring-offset-1" : ""
              }`}
            />
          ))}
        </div>
      </td>
      <td className="py-1 pr-2">
        <input
          autoFocus
          value={editing?.name ?? ""}
          onChange={(e) => setEditing((s) => (s === null ? s : { ...s, name: e.target.value }))}
          onKeyDown={onKeyDown}
          className="w-full rounded border border-gray-300 px-2 py-1"
          placeholder="モード名"
        />
      </td>
      <td className="py-1 text-right whitespace-nowrap">
        <button onClick={save} disabled={isPending} className="px-2 text-blue-600">
          保存
        </button>
        <button onClick={() => setEditing(null)} className="px-2 text-gray-500">
          取消
        </button>
      </td>
    </tr>
  );

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">色はプリセットから選択します。並び順は名前順です。</p>
        <button
          onClick={() => {
            setError(null);
            setEditing({ id: "new", name: "", color: MODE_COLORS[0] });
          }}
          className="rounded border border-gray-300 px-3 py-1 text-sm"
        >
          ＋ 新規追加
        </button>
      </div>

      {error !== null && (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 text-left text-xs text-gray-500">
            <th className="w-48 py-2 font-normal">色</th>
            <th className="py-2 font-normal">名前</th>
            <th className="w-32 py-2" />
          </tr>
        </thead>
        <tbody>
          {active.map((mode) =>
            editing?.id === mode.id ? (
              editRow(String(mode.id))
            ) : (
              <tr key={mode.id} className="border-b border-gray-100">
                <td className="py-2">
                  <span
                    style={{ backgroundColor: mode.color }}
                    className="inline-block h-3 w-10 rounded"
                    aria-hidden
                  />
                </td>
                <td className="py-2">{mode.name}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => {
                      setError(null);
                      setEditing({ id: mode.id, name: mode.name, color: mode.color });
                    }}
                    className="px-2 text-blue-600"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => run(() => setModeArchivedAction(mode.id, true))}
                    disabled={isPending}
                    className="px-2 text-gray-500"
                  >
                    アーカイブ
                  </button>
                </td>
              </tr>
            )
          )}
          {editing?.id === "new" && editRow("new")}
        </tbody>
      </table>

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-gray-500">
            アーカイブ済み（{archived.length}）
          </summary>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {archived.map((mode) => (
                <tr key={mode.id} className="border-b border-gray-100 text-gray-500">
                  <td className="w-48 py-2">
                    <span
                      style={{ backgroundColor: mode.color }}
                      className="inline-block h-3 w-10 rounded opacity-50"
                      aria-hidden
                    />
                  </td>
                  <td className="py-2">{mode.name}</td>
                  <td className="w-32 py-2 text-right">
                    <button
                      onClick={() => run(() => setModeArchivedAction(mode.id, false))}
                      disabled={isPending}
                      className="px-2 text-blue-600"
                    >
                      復元
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </section>
  );
}
