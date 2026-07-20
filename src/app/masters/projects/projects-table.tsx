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
import type { Project } from "@/domain/project/project";
import { DeleteMasterButton } from "../_components/delete-master-button";
import type { ActionResult } from "../_lib/action-result";
import {
  createProjectAction,
  deleteProjectAction,
  setProjectArchivedAction,
  updateProjectAction,
} from "./actions";

type Props = Readonly<{
  active: readonly Project[];
  archived: readonly Project[];
  deletableIds: readonly number[];
}>;

type Editing = Readonly<{ id: number | "new"; name: string }>;

export function ProjectsTable({ active, archived, deletableIds }: Props) {
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
    <tr key={key} className="border-b border-line">
      <td className="py-1 pr-2">
        <input
          autoFocus
          value={editing?.name ?? ""}
          onChange={(e) => setEditing((s) => (s === null ? s : { ...s, name: e.target.value }))}
          onKeyDown={onKeyDown}
          className={`w-full ${inputBase}`}
          placeholder="プロジェクト名"
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
        <p className="text-xs text-ink-muted">
          並び順は名前順です（`01.仕事` のような接頭辞で制御できます）。
        </p>
        <button
          onClick={() => {
            setError(null);
            setEditing({ id: "new", name: "" });
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
            <th className="py-2 font-normal">名前</th>
            <th className="w-32 py-2" />
          </tr>
        </thead>
        <tbody>
          {active.map((project) =>
            editing?.id === project.id ? (
              editRow(String(project.id))
            ) : (
              <tr key={project.id} className="border-b border-line">
                <td className="py-2">{project.name}</td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => {
                      setError(null);
                      setEditing({ id: project.id, name: project.name });
                    }}
                    className={`px-2 ${linkAccent}`}
                  >
                    編集
                  </button>
                  <button
                    onClick={() => run(() => setProjectArchivedAction(project.id, true))}
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

      {active.length === 0 && editing === null && (
        <p className="mt-4 text-sm text-ink-muted">プロジェクトはまだありません。</p>
      )}

      {archived.length > 0 && (
        <details className="mt-6">
          <summary className="cursor-pointer text-sm text-ink-muted">
            アーカイブ済み（{archived.length}）
          </summary>
          <table className="mt-2 w-full text-sm">
            <tbody>
              {archived.map((project) => (
                <tr key={project.id} className="border-b border-line text-ink-muted">
                  <td className="py-2">{project.name}</td>
                  <td className="w-32 py-2 text-right whitespace-nowrap">
                    <button
                      onClick={() => run(() => setProjectArchivedAction(project.id, false))}
                      disabled={isPending}
                      className={`px-2 ${linkAccent}`}
                    >
                      復元
                    </button>
                    {deletableIds.includes(project.id) && (
                      <DeleteMasterButton
                        onDelete={() => run(() => deleteProjectAction(project.id))}
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
