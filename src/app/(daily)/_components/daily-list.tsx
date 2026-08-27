"use client";

import { Fragment, type ReactNode } from "react";
import type { Bundle, BundleId } from "@/domain/bundle/bundle";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { APP_TIME_ZONE } from "@/domain/shared/time-zone";
import type { DailyGroup } from "@/domain/task/daily-list";
import { formatProjectedStart, projectedStartTimes, sectionSlacks } from "@/domain/task/projection";
import type { SectionId } from "@/domain/section/section";
import type { TaskId } from "@/domain/task/task";
import { showsCommentRow, type EditingCell } from "../_lib/editing";
import { useElementHeight } from "@/app/_lib/use-element-height";
import { tableHeadRule, tableHeadText } from "@/app/_lib/ui";
import { toSectionOptions } from "../_lib/section-options";
import { CommentRow, type CommentRowProps } from "./comment-row";
import { GroupHeading, type GroupHeadingProps } from "./group-heading";
import { TaskRow, type TaskRowProps } from "./task-row";

/**
 * リストの props。**行・見出しへそのまま渡す項目は子の型から派生させる**（同じ内容を2度書くと
 * 片方だけ変わる事故になるため。T-53）。下の Readonly ブロックはリストにしかない項目
 */
export type DailyListProps = Pick<
  TaskRowProps,
  | "now"
  | "modes"
  | "projects"
  | "sections"
  | "onRename"
  | "onEstimate"
  | "onPunch"
  | "isFutureDate"
  | "onEditPunch"
  | "onAssign"
  | "onOperate"
  | "onToggleHighlight"
  | "onRoutinize"
  | "onSelect"
  | "onBeginEdit"
  | "onEndEdit"
> &
  // コメント行（O-16）はタスク行の下に並べるので、その入口もリストが受け取る
  Pick<CommentRowProps, "onComment"> &
  // `currentSectionId` は現在地の探索（§5）と共用するため board が求めて配る
  Pick<GroupHeadingProps, "currentSectionId"> &
  Readonly<{
    groups: readonly DailyGroup[];
    selectedId: TaskId | null;
    /** 編集中のセル（選択行モデルと同じく親が単一の真実を持つ） */
    editing: EditingCell | null;
    /** 表示日。セクション残り時間（§3.2）の枠をこの日の論理日に敷く */
    date: LogicalDate;
    /** 表示日が今日か。予想開始時刻（§3.3）は今日のみ出す */
    isToday: boolean;
    /** 日界（分）。セクションの枠を論理日の区切りで測る起点（F-116） */
    dayStartMinutes: number;
    /** バンドルの道（F-119 / §3.3）。bundleId → bundle の Map を board が組み、行ごとの解決はここでする */
    bundleById: ReadonlyMap<BundleId, Bundle>;
    /**
     * 上部の板（h1・日付ナビ＋サマリ・クイック追加欄）の実測高さ（§2）。
     * 列見出し行とセクション見出し行をこの直下へ順に積む起点になる
     */
    boardHeight: number;
  }>;

// 画面定義書01 §3.2/§3.3
export function DailyList({
  groups,
  modes,
  projects,
  onRename,
  onEstimate,
  onComment,
  onPunch,
  isFutureDate,
  onEditPunch,
  sections,
  onAssign,
  onOperate,
  onToggleHighlight,
  onRoutinize,
  selectedId,
  onSelect,
  editing,
  onBeginEdit,
  onEndEdit,
  now,
  date,
  isToday,
  dayStartMinutes,
  currentSectionId,
  boardHeight,
  bundleById,
}: DailyListProps) {
  const modeById = new Map(modes.map((m) => [m.id, m]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  // 固定領域は「板 → 列見出し → セクション見出し」の3段（§2）。上ほど手前に置くので、
  // 各段の `top` は自分より上の段の高さの合計になる。高さを定数で置かない理由は `useElementHeight`
  const [columnHeadRef, columnHeadHeight] = useElementHeight<HTMLTableRowElement>();
  const [sectionHeadRef, sectionHeadHeight] = useElementHeight<HTMLTableCellElement>();
  const sectionHeadTop = boardHeight + columnHeadHeight;
  // 選択行の追従が避ける高さ（§5）。貼り付いた見出しの裏に行が隠れないよう、3段ぶんを足す
  const rowScrollMarginTop = sectionHeadTop + sectionHeadHeight;

  const projectedStarts = projectedStartLabels(groups, now, isToday, dayStartMinutes);
  // 表示日は「過去・今日・未来」のいずれか1つなので、過去は残り2つの否定で決まる（§3.2 の表示条件）
  const remainings = sectionRemainings(
    groups,
    date,
    now,
    !isToday && !isFutureDate,
    dayStartMinutes
  );
  // セクション選択の候補（O-5 / §4.3）。先頭の固定項目が currentSectionId を要るため、
  // 行ではなくここで組んで渡す（モード・プロジェクトの候補は行側で組む）
  const sectionOptions = toSectionOptions(sections, currentSectionId);

  return (
    // table-fixed + colgroup で列幅を1箇所に集約する。**table-auto にしない**——colSpan の行
    // （セクション見出し・空セクション）の内容量で列幅が動き、見出しと本文の列境界が揃わなくなる（FB-14）
    <table className="mt-4 w-full table-fixed">
      <colgroup>
        {/* バンドルの道（F-119 / §3.3）。太さ6px固定の縦帯なので他の列と同じく専用の col を持つ */}
        <col className="w-1.5" />
        <col className="w-10" />
        <col />
        {/* プロジェクト・モードは同幅の固定幅（§3.3。収まらない名前は AssignCell で切り詰める） */}
        <col className="w-32" />
        <col className="w-32" />
        <col className="w-24" />
        <col className="w-28" />
        <col className="w-40" />
        {/* 行メニュー（3点リーダーのボタン）の実際の footprint に合わせる（FB-14） */}
        <col className="w-10" />
      </colgroup>
      {/*
        列見出しは画面トップに1つだけ置く（セクションごとに繰り返さない）。板の直下に固定し、
        その下罫線がそのまま板とリストの境界になる（§2）。**罫線は行ではなくセルが持つ**
        （`tableHeadRule` の JSDoc。行に置くと貼り付いたセルと一緒に動かない）
      */}
      <thead>
        <tr ref={columnHeadRef} className={tableHeadText}>
          {/* バンドルの道の列見出しは常設しない（帯にマウスを乗せたときにだけ名前を出す。§3.3） */}
          <ColumnHead top={boardHeight} />
          <ColumnHead top={boardHeight} />
          <ColumnHead top={boardHeight}>タスク</ColumnHead>
          <ColumnHead top={boardHeight}>プロジェクト</ColumnHead>
          <ColumnHead top={boardHeight}>モード</ColumnHead>
          <ColumnHead top={boardHeight} align="right">
            見積
          </ColumnHead>
          <ColumnHead top={boardHeight} align="right">
            実績
          </ColumnHead>
          <ColumnHead top={boardHeight} align="right">
            実施時間
          </ColumnHead>
          <ColumnHead top={boardHeight} />
        </tr>
      </thead>
      {groups.map((group, groupIndex) => (
        <tbody key={group.section?.id ?? "unclassified"}>
          {/* 0件のセクションは見出し行だけを置く（§3.2 / FB-26） */}
          <GroupHeading
            group={group}
            remainingMinutes={
              group.section === null ? null : (remainings?.get(group.section.id) ?? null)
            }
            currentSectionId={currentSectionId}
            top={sectionHeadTop}
            // 見出しの高さはどれも同じなので先頭の1つだけ測る（先頭は常にある「未分類」＝
            // 並びが変わっても入れ替わらないので、観測している要素が差し替わらない）
            cellRef={groupIndex === 0 ? sectionHeadRef : undefined}
          />
          {group.tasks.map((task, index) => {
            const isSelected = task.id === selectedId;
            const editingField = editing?.taskId === task.id ? editing.field : null;
            const mode = task.modeId === null ? undefined : modeById.get(task.modeId);
            // バンドルの道（F-119 / §3.3）。隣接は見ない——所属が読めればよいので行ごとに独立して解決する
            const bundle = task.bundleId === null ? null : (bundleById.get(task.bundleId) ?? null);
            return (
              // コメント（O-16）はタスク行の下に続く独立した行なので、1タスクで2行になりうる
              <Fragment key={task.id}>
                <TaskRow
                  task={task}
                  bundle={bundle}
                  index={index}
                  sectionId={group.section?.id ?? null}
                  modes={modes}
                  projects={projects}
                  sections={sections}
                  sectionOptions={sectionOptions}
                  onAssign={onAssign}
                  onOperate={onOperate}
                  onToggleHighlight={onToggleHighlight}
                  onRoutinize={onRoutinize}
                  isSelected={isSelected}
                  onSelect={onSelect}
                  editing={editingField}
                  onBeginEdit={onBeginEdit}
                  onEndEdit={onEndEdit}
                  mode={mode}
                  project={task.projectId === null ? undefined : projectById.get(task.projectId)}
                  onRename={onRename}
                  onEstimate={onEstimate}
                  onPunch={onPunch}
                  isFutureDate={isFutureDate}
                  onEditPunch={onEditPunch}
                  now={now}
                  projectedStart={projectedStarts?.get(task.id) ?? null}
                  scrollMarginTop={rowScrollMarginTop}
                />
                {showsCommentRow(task, isSelected, editingField) && (
                  <CommentRow
                    task={task}
                    bundle={bundle}
                    mode={mode}
                    isSelected={isSelected}
                    editing={editingField}
                    onComment={onComment}
                    onEndEdit={onEndEdit}
                  />
                )}
              </Fragment>
            );
          })}
        </tbody>
      ))}
    </table>
  );
}

/**
 * 板の直下に固定する列見出しセル（§2）。**`<tr>` には `position: sticky` が効かない**ので
 * セル側に付ける。地色（`bg-paper`）は必須——透けると下を流れる行が読めてしまう
 */
function ColumnHead({
  top,
  align = "left",
  children,
}: Readonly<{ top: number; align?: "left" | "right"; children?: ReactNode }>) {
  return (
    <th
      // 重なり順は板（`z-10`）より下・通常の行より上（重なり順の全体像は `ui.ts`）
      className={`sticky z-2 ${tableHeadRule} bg-paper py-2 font-normal ${
        align === "right" ? "text-right" : ""
      }`}
      style={{ top }}
    >
      {children}
    </th>
  );
}

/**
 * 見出しに出すセクション残り時間（F-110 / §3.2）を sectionId で引ける Map。値と算出の規則は
 * `sectionSlacks`（データモデル定義書 §4.3）が持つ。ここで足すのは表示条件だけ——
 * **表示日が過去なら出さない**（null）。今日はさらに**現在時刻が枠の終了より前**のものに絞る
 * （未来日の枠はすべて現在時刻より後なので、同じ絞り込みが素通りする）
 */
function sectionRemainings(
  groups: readonly DailyGroup[],
  date: LogicalDate,
  now: Date,
  isPastDate: boolean,
  dayStartMinutes: number
): Map<SectionId, number> | null {
  if (isPastDate) return null;

  const slacks = sectionSlacks(groups, date, now, APP_TIME_ZONE, dayStartMinutes);
  return new Map(
    [...slacks]
      .filter(([, slack]) => now.getTime() < slack.endAt.getTime())
      .map(([id, slack]) => [id, slack.slackMinutes])
  );
}

/**
 * 未実行タスクの予想開始時刻の表示文字列（F-120 / §3.3）を taskId で引ける Map。
 * groups は表示順（§3.2 の回転順 → sort_order）なので平坦化してそのまま積み上げる
 * （セクションをまたいでもリセットしない）。表示日が今日でなければ null（行に出さない）
 */
function projectedStartLabels(
  groups: readonly DailyGroup[],
  now: Date,
  isToday: boolean,
  dayStartMinutes: number
): Map<TaskId, string> | null {
  if (!isToday) return null;

  const starts = projectedStartTimes(
    groups.flatMap((group) => group.tasks),
    now
  );
  return new Map(
    [...starts].map(([id, start]) => [
      id,
      formatProjectedStart(start, now, APP_TIME_ZONE, dayStartMinutes),
    ])
  );
}
