"use client";

import { useState } from "react";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { btnSecondary, inputBase, linkAccent, linkMuted, noticeDanger } from "@/app/_lib/ui";
import { PlusIcon } from "@/app/_components/icons";
import type { Project } from "@/domain/project/project";
import { ArchivedMasterSection } from "../_components/archived-master-section";
import { useMasterAction } from "../_lib/use-master-action";
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
  const { error, setError, isPending, run } = useMasterAction();

  /**
   * 保存の経路は blur の1本だけにする（画面定義書03 §4「編集方式」）。
   * Enter・Esc は入力欄を blur させて合流させ、二重送信を避ける。
   * 値は S-01 のインライン編集と同じく DOM から読む（親は編集状態だけを持つ）
   */
  function commit(input: HTMLInputElement) {
    if (editing === null) return;
    const name = input.value;
    const original = active.find((p) => p.id === editing.id)?.name;

    // 変更がなければ何もせず閉じる（クリックしただけで UPDATE が飛ばないように）
    if (editing.id !== "new" && name === original) {
      setEditing(null);
      return;
    }

    const action =
      editing.id === "new"
        ? () => createProjectAction({ name })
        : () => updateProjectAction(editing.id as number, { name });
    // 失敗時は編集状態のまま残し、入力し直せるようにする
    run(action, () => setEditing(null));
  }

  const onKeyDown = inlineEditKeyHandler({
    onEnter: (input) => input.blur(),
    onEscape: (input) => {
      // 元の値へ戻してから blur すると、commit が「変更なし」と判断して閉じるだけになる
      input.value = active.find((p) => p.id === editing?.id)?.name ?? "";
      input.blur();
    },
  });

  /** 一覧の名前セル。クリックでその場編集（§4「編集方式」） */
  const nameCell = (project: Project) =>
    editing?.id === project.id ? (
      <input
        autoFocus
        defaultValue={project.name}
        onKeyDown={onKeyDown}
        onBlur={(e) => commit(e.currentTarget)}
        className={`w-full ${inputBase}`}
      />
    ) : (
      <button
        type="button"
        onClick={() => {
          setError(null);
          setEditing({ id: project.id, name: project.name });
        }}
        className="text-left hover:underline"
      >
        {project.name}
      </button>
    );

  // 新規行は保存経路が blur ではないので、Enter で直接保存する（IME 判定は共通関数に任せる）
  const onNewKeyDown = inlineEditKeyHandler({
    onEnter: (input) => commit(input),
    onEscape: () => setEditing(null),
  });

  // 新規追加の行だけは明示的な保存・取消を置く（既存行の編集はセルのインライン編集）
  const newRow = (key: string) => (
    <tr key={key} className="border-b border-line">
      <td className="py-1 pr-2">
        <input
          autoFocus
          defaultValue=""
          onKeyDown={onNewKeyDown}
          className={`w-full ${inputBase}`}
          placeholder="プロジェクト名"
        />
      </td>
      <td className="py-1 text-right whitespace-nowrap">
        <button
          onMouseDown={(e) => e.preventDefault()} // blur より先に押下を拾う
          onClick={(e) => {
            const input = e.currentTarget.closest("tr")?.querySelector("input");
            if (input !== null && input !== undefined) commit(input);
          }}
          disabled={isPending}
          className={`px-2 ${linkAccent}`}
        >
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
          {editing?.id === "new" && newRow("new")}
        </tbody>
      </table>

      {active.length === 0 && editing === null && (
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
