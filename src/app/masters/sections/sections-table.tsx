"use client";

import { useState, useTransition } from "react";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import type { Section } from "@/domain/section/section";
import type { ActionResult } from "../_lib/action-result";
import {
  archiveSectionAction,
  createSectionAction,
  restoreSectionAction,
  updateSectionAction,
} from "./actions";

type SectionRow = Section & { endTime: string };

type Props = Readonly<{
  ranges: readonly SectionRow[];
  archived: readonly Section[];
}>;

type Editing = Readonly<{ id: number | "new"; name: string; startTime: string }>;

export function SectionsTable({ ranges, archived }: Props) {
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
    const input = { name: editing.name, startTime: editing.startTime };
    const action =
      editing.id === "new"
        ? () => createSectionAction(input)
        : () => updateSectionAction(editing.id as number, input);
    run(action, () => setEditing(null));
  }

  const onKeyDown = inlineEditKeyHandler({ onEnter: save, onEscape: () => setEditing(null) });

  // 編集中の行の終了時刻（導出値）。新規追加時は保存後に確定するため未定
  const editingEndTime = ranges.find((r) => r.id === editing?.id)?.endTime;

  const editRow = (key: string) => (
    <tr key={key} className="border-b border-gray-100">
      <td className="py-1 pr-2">
        <input
          autoFocus
          value={editing?.name ?? ""}
          onChange={(e) => setEditing((s) => (s === null ? s : { ...s, name: e.target.value }))}
          onKeyDown={onKeyDown}
          className="w-full rounded border border-gray-300 px-2 py-1"
          placeholder="セクション名"
        />
      </td>
      <td className="py-1 pr-2">
        {/* 編集できるのは開始時刻のみ。終了時刻は次セクションの開始からの導出値なので読み取り専用で並べる */}
        <span className="flex items-center gap-1">
          <input
            type="time"
            value={editing?.startTime ?? ""}
            onChange={(e) =>
              setEditing((s) => (s === null ? s : { ...s, startTime: e.target.value }))
            }
            onKeyDown={onKeyDown}
            className="rounded border border-gray-300 px-2 py-1"
          />
          <span className="tabular-nums text-gray-400" title="次のセクションの開始時刻から自動導出">
            –{editingEndTime ?? "自動"}
          </span>
        </span>
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
        <p className="text-xs text-gray-500">
          編集できるのは開始時刻だけです（終了時刻は次のセクションの開始から自動導出）。並び順は開始時刻順です。
        </p>
        <button
          onClick={() => {
            setError(null);
            setEditing({ id: "new", name: "", startTime: "" });
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
            <th className="py-2 font-normal">名前</th>
            <th className="w-40 py-2 font-normal">時間帯</th>
            <th className="w-32 py-2" />
          </tr>
        </thead>
        <tbody>
          {ranges.map((row) =>
            editing?.id === row.id ? (
              editRow(String(row.id))
            ) : (
              <tr key={row.id} className="border-b border-gray-100">
                <td className="py-2">{row.name}</td>
                <td className="py-2 tabular-nums text-gray-600">
                  {row.startTime}–{row.endTime}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => {
                      setError(null);
                      setEditing({ id: row.id, name: row.name, startTime: row.startTime });
                    }}
                    className="px-2 text-blue-600"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => run(() => archiveSectionAction(row.id))}
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
              {archived.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 text-gray-500">
                  <td className="py-2">{row.name}</td>
                  <td className="w-40 py-2 tabular-nums">{row.startTime}</td>
                  <td className="w-32 py-2 text-right">
                    <button
                      onClick={() => run(() => restoreSectionAction(row.id))}
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
