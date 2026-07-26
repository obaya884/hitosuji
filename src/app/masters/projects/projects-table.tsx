"use client";

import { useState } from "react";
import { useServerAction } from "@/app/_lib/use-server-action";
import { btnSecondary, linkMuted, noticeDanger } from "@/app/_lib/ui";
import { PlusIcon } from "@/app/_components/icons";
import type { Project } from "@/domain/project/project";
import { ArchivedMasterSection } from "../_components/archived-master-section";
import { MasterEditableCell } from "../_components/master-editable-cell";
import { MasterNewRow, MasterNewRowInput } from "../_components/master-new-row";
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

export function ProjectsTable({ active, archived, deletableIds }: Props) {
  // 編集中のセル（`"new"` は新規追加行）。値は入力欄の DOM が持つ
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const { error, setError, isPending, run } = useServerAction();

  /** 一覧の名前セル。クリックでその場編集（§4「編集方式」） */
  const nameCell = (project: Project) => (
    <MasterEditableCell
      isEditing={editingId === project.id}
      value={project.name}
      isPending={isPending}
      onStartEditing={() => {
        setError(null);
        setEditingId(project.id);
      }}
      // 失敗時は編集状態のまま残し、入力し直せるようにする
      onCommit={(name) =>
        run(() => updateProjectAction(project.id, { name }), () => setEditingId(null))
      }
      onClose={() => setEditingId(null)}
    />
  );

  const newRow = (
    <MasterNewRow
      isPending={isPending}
      onSave={(fieldValue) =>
        run(
          () => createProjectAction({ name: fieldValue("name") }),
          () => setEditingId(null)
        )
      }
      onCancel={() => setEditingId(null)}
      renderCells={(onKeyDown) => (
        <td className="py-1 pr-2">
          <MasterNewRowInput
            field="name"
            placeholder="プロジェクト名"
            autoFocus
            onKeyDown={onKeyDown}
          />
        </td>
      )}
    />
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
            setEditingId("new");
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
          {active.map((project) => (
            <tr key={project.id} className="border-b border-line">
              <td className="py-2">{nameCell(project)}</td>
              <td className="py-2 text-right whitespace-nowrap">
                <button
                  onClick={() => run(() => setProjectArchivedAction(project.id, true))}
                  disabled={isPending}
                  className={`px-2 ${linkMuted}`}
                >
                  アーカイブ
                </button>
              </td>
            </tr>
          ))}
          {editingId === "new" && newRow}
        </tbody>
      </table>

      {active.length === 0 && editingId === null && (
        <p className="mt-4 text-sm text-ink-muted">プロジェクトはまだありません。</p>
      )}

      <ArchivedMasterSection
        archived={archived}
        deletableIds={deletableIds}
        isPending={isPending}
        renderCells={(project) => <td className="py-2">{project.name}</td>}
        onRestore={(id) => run(() => setProjectArchivedAction(id, false))}
        onDelete={(id) => run(() => deleteProjectAction(id))}
      />
    </section>
  );
}
