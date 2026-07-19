"use client";

import { useState, useTransition } from "react";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import type { Project } from "@/domain/project/project";
import type { ActionResult } from "../_lib/action-result";
import { createProjectAction, setProjectArchivedAction, updateProjectAction } from "./actions";

type Props = Readonly<{
  active: readonly Project[];
  archived: readonly Project[];
}>;

type Editing = Readonly<{ id: number | "new"; name: string }>;

export function ProjectsTable({ active, archived }: Props) {
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
    const input = { name: editing.name };
    const action =
      editing.id === "new"
        ? () => createProjectAction(input)
        : () => updateProjectAction(editing.id as number, input);
    run(action, () => setEditing(null));
  }

  const onKeyDown = inlineEditKeyHandler({ onEnter: save, onEscape: () => setEditing(null) });

  const editRow = (key: string) => (
    <tr key={key} className="border-b border-gray-100">
      <td className="py-1 pr-2">
        <input
          autoFocus
          value={editing?.name ?? ""}
          onChange={(e) => setEditing((s) => (s === null ? s : { ...s, name: e.target.value }))}
          onKeyDown={onKeyDown}
          className="w-full rounded border border-gray-300 px-2 py-1"
          placeholder="プロジェクト名"
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
        <p className="text-xs text-gray-500">
          並び順は名前順です（`01.仕事` のような接頭辞で制御できます）。
        </p>
        <button
          onClick={() => {
            setError(null);
            setEditing({ id: "new", name: "" });
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
            <th className="w-32 py-2" />
          </tr>
        </thead>
        <tbody>
          {active.map((project) =>
            editing?.id === project.id ? (
              editRow(String(project.id))
            ) : (
              <tr key={project.id} className="border-b border-gray-100">
                <td className="py-2">{project.name}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => {
                      setError(null);
                      setEditing({ id: project.id, name: project.name });
                    }}
                    className="px-2 text-blue-600"
                  >
                    編集
                  </button>
                  <button
                    onClick={() => run(() => setProjectArchivedAction(project.id, true))}
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

      {active.length === 0 && editing === null && (
        <p className="mt-4 text-sm text-gray-500">プロジェクトはまだありません。</p>
      )}

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-gray-500">
            アーカイブ済み（{archived.length}）
          </summary>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {archived.map((project) => (
                <tr key={project.id} className="border-b border-gray-100 text-gray-500">
                  <td className="py-2">{project.name}</td>
                  <td className="w-32 py-2 text-right">
                    <button
                      onClick={() => run(() => setProjectArchivedAction(project.id, false))}
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
