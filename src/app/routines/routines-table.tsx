"use client";

import { useState } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import { describeRecurrence, type Routine } from "@/domain/routine/routine";
import type { RoutineInput } from "@/domain/routine/input";
import {
  sortRoutines,
  type RoutineSortDirection,
  type RoutineSortKey,
} from "@/domain/routine/order";
import { sectionAt, type Section } from "@/domain/section/section";
import { formatEstimate } from "@/app/_lib/format";
import { useServerAction } from "@/app/_lib/use-server-action";
import { btnSecondary, linkAccent, linkMuted, noticeDanger } from "@/app/_lib/ui";
import { PlusIcon } from "@/app/_components/icons";
import { UnsetMark } from "@/app/_components/unset-mark";
import {
  createRoutineAction,
  deleteRoutineAction,
  setRoutineActiveAction,
  updateRoutineAction,
} from "./actions";
import { RoutineForm } from "./routine-form";

type Props = Readonly<{
  routines: readonly Routine[];
  /** 編集フォームの選択肢。アーカイブ済みは含めない（画面定義書03 §4） */
  modes: readonly Mode[];
  projects: readonly Project[];
  /** 一覧の表示用。参照中であればアーカイブ済みマスタの名前も出す（画面定義書03 §4） */
  allModes: readonly Mode[];
  allProjects: readonly Project[];
  sections: readonly Section[];
  today: string;
}>;

/**
 * 並べ替えできる列見出し（F-306 / 画面定義書02 §3.1）。
 * クリックでその軸に切り替え、同じ列をもう一度押すと降順になる
 */
function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  className = "",
}: Readonly<{
  label: string;
  sortKey: RoutineSortKey;
  sort: Readonly<{ key: RoutineSortKey; direction: RoutineSortDirection }>;
  onSort: (key: RoutineSortKey) => void;
  className?: string;
}>) {
  const isActive = sort.key === sortKey;
  return (
    <th
      // aria-sort は見出しセル側に持たせる（button ロールでは無効なため）
      aria-sort={isActive ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}
      className={`py-2 font-normal ${className}`}
    >
      <button type="button" onClick={() => onSort(sortKey)} className="hover:text-ink">
        {label}
        <span className={isActive ? "ml-1" : "ml-1 invisible"} aria-hidden>
          {isActive && sort.direction === "desc" ? "▼" : "▲"}
        </span>
      </button>
    </th>
  );
}

/** 一覧（画面定義書02 §3）。既定の並び順は開始想定時刻の昇順（展開後のデイリーと同じ並び） */
export function RoutinesTable({
  routines,
  modes,
  projects,
  allModes,
  allProjects,
  sections,
  today,
}: Props) {
  const [editing, setEditing] = useState<Routine | "new" | null>(null);
  const [sort, setSort] = useState<Readonly<{ key: RoutineSortKey; direction: RoutineSortDirection }>>(
    { key: "scheduledStartTime", direction: "asc" }
  );
  const { error, setError, isPending, run } = useServerAction();

  const modeById = new Map(allModes.map((m) => [m.id, m]));
  const projectById = new Map(allProjects.map((p) => [p.id, p]));

  // 並べ替え（F-306 / 画面定義書02 §3.1）。既定は開始想定の昇順で、選んだ軸は記憶しない
  const sorted = sortRoutines(
    routines,
    { modes: allModes, projects: allProjects },
    sort.key,
    sort.direction
  );

  /** 同じ列をもう一度押したら降順に切り替える。別の列なら昇順から始める */
  function toggleSort(key: RoutineSortKey) {
    setSort((s) =>
      s.key === key
        ? { key, direction: s.direction === "asc" ? "desc" : "asc" }
        : { key, direction: "asc" }
    );
  }

  function save(input: RoutineInput) {
    const action =
      editing === "new"
        ? () => createRoutineAction(input)
        : () => updateRoutineAction((editing as Routine).id, input);
    run(action, () => setEditing(null));
  }

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-ink-muted">
          有効なルーチンは、デイリーリストで対象日を表示したときに自動で展開されます（当日以降のみ）。
        </p>
        <button
          onClick={() => {
            setError(null);
            setEditing("new");
          }}
          // 保存中は新しい編集を始めさせない（開いていたフォームが閉じてしまう。00_共通 §2.3）
          disabled={isPending}
          className={`inline-flex shrink-0 items-center gap-1 ${btnSecondary}`}
        >
          <PlusIcon className="h-3 w-3" />
          新規ルーチン
        </button>
      </div>

      {error !== null && (
        <p className={`mt-2 ${noticeDanger}`}>
          {error}
        </p>
      )}

      {editing === "new" && (
        <RoutineForm
          routine={null}
          modes={modes}
          projects={projects}
          today={today}
          isPending={isPending}
          onSubmit={save}
          onCancel={() => setEditing(null)}
        />
      )}

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-line-strong text-left text-xs text-ink-muted">
            <SortableHeader label="名前" sortKey="name" sort={sort} onSort={toggleSort} />
            <SortableHeader
              label="モード"
              sortKey="mode"
              sort={sort}
              onSort={toggleSort}
              className="w-24"
            />
            <SortableHeader
              label="プロジェクト"
              sortKey="project"
              sort={sort}
              onSort={toggleSort}
              className="w-28"
            />
            {/* 見積は並べ替えの対象外（画面定義書02 §3.1） */}
            <th className="w-20 py-2 pr-4 text-right font-normal">見積</th>
            <SortableHeader
              label="繰り返し"
              sortKey="recurrence"
              sort={sort}
              onSort={toggleSort}
              className="w-40"
            />
            <SortableHeader
              label="開始想定"
              sortKey="scheduledStartTime"
              sort={sort}
              onSort={toggleSort}
              className="w-32"
            />
            <th className="w-12 py-2 font-normal">有効</th>
            <th className="w-24 py-2 font-normal" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((routine) => {
            const mode = routine.modeId === null ? undefined : modeById.get(routine.modeId);
            const project =
              routine.projectId === null ? undefined : projectById.get(routine.projectId);
            const section = sectionAt(sections, routine.scheduledStartTime);
            const isEditing = editing !== null && editing !== "new" && editing.id === routine.id;

            return (
              <tr
                key={routine.id}
                // 無効ルーチンはグレーアウト（画面定義書02 §3）
                className={`border-b border-line ${routine.isActive ? "" : "text-ink-faint"}`}
              >
                <td
                  className="py-2"
                  // モード色を名前の文字色に反映する（S-01と同じ表現。画面定義書02 §3）
                  style={
                    routine.isActive && mode !== undefined ? { color: mode.color } : undefined
                  }
                >
                  {routine.name}
                </td>
                <td className="py-2 text-xs">{mode?.name ?? <UnsetMark />}</td>
                <td className="py-2 text-xs">{project?.name ?? <UnsetMark />}</td>
                <td className="py-2 pr-4 text-right font-mono tabular-nums">
                  {formatEstimate(routine.estimateMinutes)}
                </td>
                <td className="py-2 text-xs">{describeRecurrence(routine)}</td>
                <td className="py-2 text-xs tabular-nums">
                  <span className="font-mono">{routine.scheduledStartTime}</span>
                  {section !== undefined && (
                    <span className="ml-1 text-ink-muted">({section.name})</span>
                  )}
                </td>
                <td className="py-2">
                  <input
                    type="checkbox"
                    checked={routine.isActive}
                    disabled={isPending}
                    onChange={(e) =>
                      run(() => setRoutineActiveAction(routine.id, e.target.checked))
                    }
                    aria-label={`${routine.name} を有効にする`}
                    className="accent-accent"
                  />
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => {
                      setError(null);
                      setEditing(isEditing ? null : routine);
                    }}
                    // 保存中は編集を開かせない（この画面は保存完了を待って反映する＝§1 なので
                    // 00_共通 §2.3「保存中」の適用対象。古い値での上書きを防ぐ。FB-63）
                    disabled={isPending}
                    className={`px-2 ${linkAccent}`}
                  >
                    {isEditing ? "閉じる" : "編集"}
                  </button>
                  <button
                    onClick={() => {
                      if (
                        !window.confirm(
                          `「${routine.name}」を削除しますか？\n展開済みのタスクは残ります。`
                        )
                      ) {
                        return;
                      }
                      run(() => deleteRoutineAction(routine.id));
                    }}
                    disabled={isPending}
                    className={`px-2 ${linkMuted}`}
                  >
                    削除
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {routines.length === 0 && editing === null && (
        <p className="mt-4 text-sm text-ink-muted">ルーチンはまだありません。</p>
      )}

      {editing !== null && editing !== "new" && (
        <RoutineForm
          key={editing.id}
          routine={editing}
          modes={modes}
          projects={projects}
          today={today}
          isPending={isPending}
          onSubmit={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  );
}
