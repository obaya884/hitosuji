"use client";

import { Fragment } from "react";
import { APP_TIME_ZONE } from "@/domain/shared/time-zone";
import type { DailyGroup } from "@/domain/task/daily-list";
import { formatProjectedStart, projectedStartTimes, sectionSlacks } from "@/domain/task/projection";
import type { SectionId } from "@/domain/section/section";
import type { TaskId } from "@/domain/task/task";
import { showsCommentRow, type EditingCell } from "../_lib/editing";
import { tableHeadRow } from "@/app/_lib/ui";
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
  | "onEditPunch"
  | "onAssign"
  | "onOperate"
  | "onToggleHighlight"
  | "onRoutinize"
  | "onSelect"
  | "onBeginEdit"
  | "onEndEdit"
  | "stickyHeight"
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
    /** 表示日が今日か。セクション残り時間（§3.2）と予想開始時刻（§3.3）は今日のみ出す */
    isToday: boolean;
    /** 日界（分）。セクションの枠を論理日の区切りで測る起点（F-116） */
    dayStartMinutes: number;
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
  isToday,
  dayStartMinutes,
  currentSectionId,
  stickyHeight,
}: DailyListProps) {
  const modeById = new Map(modes.map((m) => [m.id, m]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  const projectedStarts = projectedStartLabels(groups, now, isToday, dayStartMinutes);
  const remainings = sectionRemainings(groups, now, isToday, dayStartMinutes);
  // セクション選択の候補（O-5 / §4.3）。先頭の固定項目が currentSectionId を要るため、
  // 行ではなくここで組んで渡す（モード・プロジェクトの候補は行側で組む）
  const sectionOptions = toSectionOptions(sections, currentSectionId);

  return (
    // table-fixed + colgroup で列幅を1箇所に集約する。**table-auto にしない**——colSpan の行
    // （セクション見出し・空セクション）の内容量で列幅が動き、見出しと本文の列境界が揃わなくなる（FB-14）
    <table className="mt-4 w-full table-fixed">
      <colgroup>
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
      {/* 列見出しは画面トップに1つだけ置く（セクションごとに繰り返さない） */}
      <thead>
        <tr className={tableHeadRow}>
          <th className="py-2 font-normal" />
          <th className="py-2 font-normal">タスク</th>
          <th className="py-2 font-normal">プロジェクト</th>
          <th className="py-2 font-normal">モード</th>
          <th className="py-2 text-right font-normal">見積</th>
          <th className="py-2 text-right font-normal">実績</th>
          <th className="py-2 text-right font-normal">実施時間</th>
          <th className="py-2 font-normal" />
        </tr>
      </thead>
      {groups.map((group) => (
        <tbody key={group.section?.id ?? "unclassified"}>
          {/* 0件のセクションは見出し行だけを置く（§3.2 / FB-26） */}
          <GroupHeading
            group={group}
            remainingMinutes={
              group.section === null ? null : (remainings?.get(group.section.id) ?? null)
            }
            currentSectionId={currentSectionId}
          />
          {group.tasks.map((task, index) => {
            const isSelected = task.id === selectedId;
            const editingField = editing?.taskId === task.id ? editing.field : null;
            const mode = task.modeId === null ? undefined : modeById.get(task.modeId);
            return (
              // コメント（O-16）はタスク行の下に続く独立した行なので、1タスクで2行になりうる
              <Fragment key={task.id}>
                <TaskRow
                  task={task}
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
                  onEditPunch={onEditPunch}
                  now={now}
                  projectedStart={projectedStarts?.get(task.id) ?? null}
                  stickyHeight={stickyHeight}
                />
                {showsCommentRow(task, isSelected, editingField) && (
                  <CommentRow
                    task={task}
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
 * 見出しに出すセクション残り時間（F-110 / §3.2）を sectionId で引ける Map。値と算出の規則は
 * `sectionSlacks`（データモデル定義書 §4.3）が持つ。ここで足すのは表示条件だけ——
 * **表示日が今日で、かつ現在時刻が枠の終了より前**のものに絞る。今日でなければ null（見出しに出さない）
 */
function sectionRemainings(
  groups: readonly DailyGroup[],
  now: Date,
  isToday: boolean,
  dayStartMinutes: number
): Map<SectionId, number> | null {
  if (!isToday) return null;

  const slacks = sectionSlacks(groups, now, APP_TIME_ZONE, dayStartMinutes);
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
