"use client";

import { useState, useTransition } from "react";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import {
  btnSecondary,
  inputBase,
  linkAccent,
  linkMuted,
  noticeDanger,
} from "@/app/_lib/ui";
import { PlusIcon } from "@/app/_components/icons";
import { MODE_COLORS, modeColorName, type Mode } from "@/domain/mode/mode";
import { DeleteMasterButton } from "../_components/delete-master-button";
import type { ActionResult } from "../_lib/action-result";
import {
  createModeAction,
  deleteModeAction,
  setModeArchivedAction,
  updateModeAction,
} from "./actions";

type Props = Readonly<{
  active: readonly Mode[];
  archived: readonly Mode[];
  deletableIds: readonly number[];
}>;

type Editing = Readonly<{ id: number | "new"; name: string; color: string }>;

export function ModesTable({ active, archived, deletableIds }: Props) {
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
    <tr key={key} className="border-b border-line">
      <td className="py-1 pr-2">
        <div className="flex flex-wrap gap-1">
          {MODE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              title={modeColorName(color)}
              aria-label={`色 ${modeColorName(color)}`}
              aria-pressed={editing?.color === color}
              onClick={() => setEditing((s) => (s === null ? s : { ...s, color }))}
              style={{ backgroundColor: color }}
              className={`h-5 w-5 rounded-full ${
                editing?.color === color
                  ? "outline-solid outline-2 outline-offset-2 outline-ink"
                  : ""
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
          className={`w-full ${inputBase}`}
          placeholder="モード名"
        />
      </td>
      <td className="py-1 text-right whitespace-nowrap">
        <button onClick={save} disabled={isPending} className={`px-2 ${linkAccent}`}>
          保存
        </button>
        <button onClick={() => setEditing(null)} className={`px-2 ${linkMuted}`}>
          取消
        </button>
      </td>
    </tr>
  );

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">色はプリセットから選択します。並び順は名前順です。</p>
        <button
          onClick={() => {
            setError(null);
            setEditing({ id: "new", name: "", color: MODE_COLORS[0] });
          }}
          className={`inline-flex shrink-0 items-center gap-1 ${btnSecondary}`}
        >
          <PlusIcon className="h-3 w-3" />
          新規追加
        </button>
      </div>

      {error !== null && (
        <p className={`mt-2 ${noticeDanger}`}>
          {error}
        </p>
      )}

      <table className="mt-2 w-full text-sm">
        <thead>
          <tr className="border-b border-line-strong text-left text-xs text-ink-muted">
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
              <tr key={mode.id} className="border-b border-line">
                <td className="py-2">
                  <span className="inline-flex items-center gap-2">
                    <span
                      style={{ backgroundColor: mode.color }}
                      className="inline-block h-3 w-10 shrink-0 rounded-control"
                      aria-hidden
                    />
                    <span className="text-xs text-ink-muted">{modeColorName(mode.color)}</span>
                  </span>
                </td>
                <td className="py-2">{mode.name}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => {
                      setError(null);
                      setEditing({ id: mode.id, name: mode.name, color: mode.color });
                    }}
                    className={`px-2 ${linkAccent}`}
                  >
                    編集
                  </button>
                  <button
                    onClick={() => run(() => setModeArchivedAction(mode.id, true))}
                    disabled={isPending}
                    className={`px-2 ${linkMuted}`}
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
          <summary className="cursor-pointer text-sm text-ink-muted">
            アーカイブ済み（{archived.length}）
          </summary>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {archived.map((mode) => (
                <tr key={mode.id} className="border-b border-line text-ink-muted">
                  <td className="w-48 py-2">
                    <span className="inline-flex items-center gap-2">
                      <span
                        style={{ backgroundColor: mode.color }}
                        className="inline-block h-3 w-10 shrink-0 rounded-control opacity-50"
                        aria-hidden
                      />
                      <span className="text-xs">{modeColorName(mode.color)}</span>
                    </span>
                  </td>
                  <td className="py-2">{mode.name}</td>
                  <td className="w-32 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => run(() => setModeArchivedAction(mode.id, false))}
                      disabled={isPending}
                      className={`px-2 ${linkAccent}`}
                    >
                      復元
                    </button>
                    {deletableIds.includes(mode.id) && (
                      <DeleteMasterButton
                        onDelete={() => run(() => deleteModeAction(mode.id))}
                        disabled={isPending}
                      />
                    )}
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
