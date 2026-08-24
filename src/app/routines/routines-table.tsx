"use client";

import { Fragment, useState } from "react";
import type { Bundle } from "@/domain/bundle/bundle";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import { describeRecurrence, type Routine, type RoutineId } from "@/domain/routine/routine";
import type { RoutineInput } from "@/domain/routine/input";
import {
  sortRoutines,
  type RoutineSortDirection,
  type RoutineSortKey,
} from "@/domain/routine/order";
import { ColorSwatch } from "@/app/_components/color-picker";
import { sectionAt, type Section } from "@/domain/section/section";
import { useServerAction } from "@/app/_lib/use-server-action";
import { linkAccent, linkMuted, tableHeadRow } from "@/app/_lib/ui";
import { DurationValue } from "@/app/_components/duration-value";
import { TableFrame } from "@/app/_components/table-frame";
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
  /** 編集フォームの選択肢。アーカイブ済みは含めない（画面定義書02 §4） */
  bundles: readonly Bundle[];
  modes: readonly Mode[];
  projects: readonly Project[];
  /** 一覧の表示用。参照中であればアーカイブ済みマスタの名前も出す（画面定義書02 §3） */
  allBundles: readonly Bundle[];
  allModes: readonly Mode[];
  allProjects: readonly Project[];
  sections: readonly Section[];
  today: string;
  /** S-05 のメンバー名リンク（`/routines?edit=<id>`）の着地点。開いた状態で初期表示する行 */
  initialEditingId?: RoutineId | null;
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
      {/* 列見出しは語そのものが押せるので下線で示す（00_共通 §2.5） */}
      <button type="button" onClick={() => onSort(sortKey)} className="hover:underline">
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
  bundles,
  modes,
  projects,
  allBundles,
  allModes,
  allProjects,
  sections,
  today,
  initialEditingId = null,
}: Props) {
  // S-05 のメンバー名リンク（`/routines?edit=<id>`）で開いた状態にする（画面定義書05 O-7）。
  // 見つからない id は静かに無視する（削除済み等。新規/一覧のまま表示すれば十分）
  const [editing, setEditing] = useState<Routine | "new" | null>(() =>
    initialEditingId === null ? null : (routines.find((r) => r.id === initialEditingId) ?? null)
  );
  const [sort, setSort] = useState<Readonly<{ key: RoutineSortKey; direction: RoutineSortDirection }>>(
    { key: "scheduledStartTime", direction: "asc" }
  );
  const { error, setError, isPending, run } = useServerAction();

  const bundleById = new Map(allBundles.map((b) => [b.id, b]));
  const modeById = new Map(allModes.map((m) => [m.id, m]));
  const projectById = new Map(allProjects.map((p) => [p.id, p]));

  // 並べ替え（F-306 / 画面定義書02 §3.1）。既定は開始想定の昇順で、選んだ軸は記憶しない
  const sorted = sortRoutines(
    routines,
    { bundles: allBundles, modes: allModes, projects: allProjects },
    sort.key,
    sort.direction
  );

  // 見出し行に出す本数（画面定義書02 §3）。無効にしたルーチンは以後展開されない（F-303）
  const activeCount = routines.filter((r) => r.isActive).length;

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

  /** 新規（`target = null`）と編集で同じフォームを使う（画面定義書02 §4） */
  const form = (target: Routine | null) => (
    <RoutineForm
      routine={target}
      bundles={bundles}
      modes={modes}
      projects={projects}
      today={today}
      isPending={isPending}
      onSubmit={save}
      onCancel={() => setEditing(null)}
    />
  );

  return (
    <TableFrame
      description="有効なルーチンは、デイリーリストで対象日を表示したときに自動で展開されます（当日以降のみ）。"
      countLabel={`${activeCount} / ${routines.length} 件`}
      error={error}
      isPending={isPending}
      addLabel="新規ルーチン"
      onAddNew={() => {
        setError(null);
        setEditing("new");
      }}
    >
      {editing === "new" && form(null)}

      <table className="mt-3 w-full">
        <thead>
          <tr className={tableHeadRow}>
            <SortableHeader label="名前" sortKey="name" sort={sort} onSort={toggleSort} />
            <SortableHeader
              label="プロジェクト"
              sortKey="project"
              sort={sort}
              onSort={toggleSort}
              className="w-28"
            />
            <SortableHeader
              label="モード"
              sortKey="mode"
              sort={sort}
              onSort={toggleSort}
              className="w-24"
            />
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
            {/* 見積は並べ替えの対象外（画面定義書02 §3.1） */}
            <th className="w-20 py-2 pr-4 text-right font-normal">見積</th>
            <SortableHeader
              label="バンドル"
              sortKey="bundle"
              sort={sort}
              onSort={toggleSort}
              // 分類の他の列より広く取る——値のほかに色見本を抱えるぶん、同じ字数でも先に溢れる
              className="w-44"
            />
            <th className="w-12 py-2 font-normal">有効</th>
            <th className="w-24 py-2 font-normal" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((routine) => {
            const bundle =
              routine.bundleId === null ? undefined : bundleById.get(routine.bundleId);
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
                <td className="py-2 text-sm">{project?.name ?? <UnsetMark />}</td>
                <td className="py-2 text-sm">{mode?.name ?? <UnsetMark />}</td>
                <td className="py-2 text-sm">{describeRecurrence(routine)}</td>
                <td className="py-2 tabular-nums">
                  <span className="font-mono">{routine.scheduledStartTime}</span>
                  {/* 併記するセクション名は従（00_共通 §1.1。S-01 のタスク名に添えるセクション名と同じ） */}
                  {section !== undefined && (
                    <span className="ml-1 text-sm text-ink-muted">({section.name})</span>
                  )}
                </td>
                <td className="py-2 pr-4 text-right font-mono tabular-nums">
                  {/* 1分以上が必須（画面定義書02 §5）なので `--:--` は出ないが、同じ部品を通す */}
                  <DurationValue minutes={routine.estimateMinutes} />
                </td>
                <td className="py-2 text-sm">
                  {/* バンドル色にモード色のような主段の表現は乗せない（画面定義書02 §3。
                      モード色が乗るのは名前列だけ） */}
                  {bundle === undefined ? (
                    <UnsetMark />
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <ColorSwatch color={bundle.color} size="dot" />
                      {/* 切り詰めは §3 が決める。title は切り詰めた名前の補完（色名は S-03 の関心事） */}
                      <span className="truncate" title={bundle.name}>
                        {bundle.name}
                      </span>
                    </span>
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

      {/* key で行ごとにフォームを作り直す（別の行を開いたとき入力を持ち越さない） */}
      {editing !== null && editing !== "new" && (
        <Fragment key={editing.id}>{form(editing)}</Fragment>
      )}
    </TableFrame>
  );
}
