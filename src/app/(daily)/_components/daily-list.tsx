"use client";

import { useEffect, useRef } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { RoutineFromTaskChoice } from "@/domain/routine/routine-from-task";
import type { Section } from "@/domain/section/section";
import { totalEstimateMinutes, type DailyGroup } from "@/domain/task/daily-list";
import { sectionCapacityMinutes } from "@/domain/task/projection";
import { taskStatus } from "@/domain/task/status";
import { actualMinutes, elapsedMinutes, type Task } from "@/domain/task/task";
import { CheckIcon, PlayIcon, StopIcon } from "@/app/_components/icons";
import { formatClock, formatDuration, formatEstimate } from "@/app/_lib/format";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { inputBase } from "@/app/_lib/ui";
import { RowMenu } from "./row-menu";
import { TaskProgress } from "./task-progress";
import { RoutinizePopover } from "./routinize-popover";
import { SelectPopover, type PopoverOption } from "./select-popover";

type Props = Readonly<{
  groups: readonly DailyGroup[];
  modes: readonly Mode[];
  projects: readonly Project[];
  onRename: (task: Task, name: string) => void;
  onEstimate: (task: Task, rawMinutes: string) => void;
  onPunch: (task: Task) => void;
  onEditPunch: (task: Task, field: "startedAt" | "endedAt", hhmm: string) => void;
  sections: readonly Section[];
  onAssign: (task: Task, field: "mode" | "project" | "section", id: number | null) => void;
  onOperate: (task: Task, operation: "suspend" | "duplicate" | "postpone" | "delete") => void;
  /** ルーチン化（O-12 / §4.1） */
  onRoutinize: (task: Task, choice: RoutineFromTaskChoice) => void;
  selectedId: number | null;
  onSelect: (taskId: number) => void;
  /** 編集中のセル（選択行モデルと同じく親が単一の真実を持つ） */
  editing: EditingCell | null;
  onBeginEdit: (task: Task, field: EditField) => void;
  onEndEdit: () => void;
  /** 毎分更新される現在時刻。実行中タスクの経過表示に使う（F-205） */
  now: Date;
  /** 画面上端の固定領域の高さ（px）。選択行の追従がその裏で止まらないようにする（§2 / §5） */
  stickyHeight: number;
}>;

export type EditField =
  | "name"
  | "estimate"
  | "startedAt"
  | "endedAt"
  | "mode"
  | "project"
  | "section"
  /** ルーチン化ポップオーバー（O-12 / §4.1） */
  | "routinize";

export type EditingCell = Readonly<{ taskId: number; field: EditField }>;

// ボタンが示すのは「押したときの動作」: 未実行→開始(再生) / 実行中→終了(停止) / 完了は操作なし(チェック)
const STATUS_ICON = {
  not_started: <PlayIcon className="h-3 w-3" />,
  running: <StopIcon className="h-3 w-3" />,
  completed: <CheckIcon className="h-3 w-3" />,
} as const;

// 画面定義書01 §3.2/§3.3。打刻・並び替えは後続ステップ
export function DailyList({
  groups,
  modes,
  projects,
  onRename,
  onEstimate,
  onPunch,
  onEditPunch,
  sections,
  onAssign,
  onOperate,
  onRoutinize,
  selectedId,
  onSelect,
  editing,
  onBeginEdit,
  onEndEdit,
  now,
  stickyHeight,
}: Props) {
  const modeById = new Map(modes.map((m) => [m.id, m]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  return (
    // table-fixed + colgroup で列幅を1箇所に集約する。table-auto のままだと
    // colSpan の行（セクション見出し・空セクション）の内容量次第で列幅の再計算結果が
    // ずれ、見出しと本文の列境界が揃わないことがあった（FB-14）
    <table className="mt-4 w-full table-fixed text-base">
      <colgroup>
        <col className="w-10" />
        <col />
        <col className="w-32" />
        <col className="w-24" />
        <col className="w-28" />
        <col className="w-40" />
        {/* 行メニュー（3点リーダーのボタン）の実際の footprint に合わせる（FB-14） */}
        <col className="w-10" />
      </colgroup>
      {/* 列見出しは画面トップに1つだけ置く（セクションごとに繰り返さない） */}
      <thead>
        <tr className="border-b border-line-strong text-left text-xs text-ink-muted">
          <th className="py-2 font-normal" />
          <th className="py-2 font-normal">タスク</th>
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
          <GroupHeading group={group} />
          {group.tasks.map((task, index) => (
            <TaskRow
              key={task.id}
              task={task}
              index={index}
              sectionId={group.section?.id ?? null}
              modes={modes}
              projects={projects}
              sections={sections}
              onAssign={onAssign}
              onOperate={onOperate}
              onRoutinize={onRoutinize}
              isSelected={task.id === selectedId}
              onSelect={onSelect}
              editing={editing?.taskId === task.id ? editing.field : null}
              onBeginEdit={onBeginEdit}
              onEndEdit={onEndEdit}
              mode={task.modeId === null ? undefined : modeById.get(task.modeId)}
              project={task.projectId === null ? undefined : projectById.get(task.projectId)}
              onRename={onRename}
              onEstimate={onEstimate}
              onPunch={onPunch}
              onEditPunch={onEditPunch}
              now={now}
              stickyHeight={stickyHeight}
            />
          ))}
        </tbody>
      ))}
    </table>
  );
}

function GroupHeading({ group }: Readonly<{ group: DailyGroup }>) {
  const total = totalEstimateMinutes(group.tasks);
  // セクション枠の長さ（F-110 の分母）。未分類とアーカイブ済みセクションでは枠が定まらない
  const capacity =
    group.section === null || group.endTime === null
      ? null
      : sectionCapacityMinutes(group.section.startTime, group.endTime);
  const excess = capacity === null ? 0 : total - capacity;

  return (
    <tr className="border-y border-line-strong bg-band">
      {/* 全要素を左寄せで1行に並べる（§3.2「見出し行のレイアウト」。左右分離をやめる） */}
      <td colSpan={7} className="py-2 pl-2">
        <span className="flex items-center gap-2">
          <span className="text-sm font-bold tracking-wide">
            {group.section === null ? "未分類" : group.section.name}
          </span>
          {group.section !== null && (
            <span className="font-mono text-xs text-ink-muted tabular-nums">
              {group.section.startTime}
              {group.endTime !== null && `–${group.endTime}`}
            </span>
          )}
          {/* 0件のグループでは時間帯より右を出さない（§3.2 / FB-25。情報がないのに視線を取るため） */}
          {group.tasks.length > 0 && (
            <>
              {/* タスク進捗: プログレスバー＋実施済み/合計（F-114） */}
              <span className="ml-3 flex items-center gap-2">
                <TaskProgress tasks={group.tasks} />
              </span>
              <span className="ml-1 text-xs text-ink-muted tabular-nums">
                見積 <span className="font-mono">{formatEstimate(total)}</span>
                {capacity !== null && (
                  <span className="font-mono">
                    /{formatDuration(capacity)}{" "}
                    {/* 合計が枠を超えたら警告色（F-110） */}
                    <span className={excess > 0 ? "text-danger" : ""}>
                      ({excess > 0 ? "+" : "-"}
                      {formatDuration(Math.abs(excess))})
                    </span>
                  </span>
                )}
              </span>
            </>
          )}
        </span>
      </td>
    </tr>
  );
}

/** ポップオーバーの選択肢。アーカイブ済みマスタは選択肢に出さない（画面定義書03 §4） */
function toOptions(
  items: readonly Readonly<{ id: number; name: string; isArchived: boolean; color?: string }>[],
  noneLabel: string,
  withColor = false
): PopoverOption[] {
  return [
    { id: null, label: noneLabel },
    ...items
      .filter((item) => !item.isArchived)
      .map((item) => ({
        id: item.id,
        label: item.name,
        ...(withColor ? { color: item.color } : {}),
      })),
  ];
}

/** 見積もり超過は警告色（F-202）。見積もり未設定（0分）は超過判定しない */
function isOverEstimate(minutes: number, task: Task): boolean {
  return task.estimateMinutes > 0 && minutes > task.estimateMinutes;
}

function TaskRow({
  task,
  index,
  sectionId,
  mode,
  project,
  modes,
  projects,
  sections,
  onAssign,
  onOperate,
  onRoutinize,
  isSelected,
  onSelect,
  editing,
  onBeginEdit,
  onEndEdit,
  onRename,
  onEstimate,
  onPunch,
  onEditPunch,
  now,
  stickyHeight,
}: Readonly<{
  task: Task;
  mode?: Mode;
  project?: Project;
  onRename: (task: Task, name: string) => void;
  onEstimate: (task: Task, rawMinutes: string) => void;
  onPunch: (task: Task) => void;
  onEditPunch: (task: Task, field: "startedAt" | "endedAt", hhmm: string) => void;
  index: number;
  sectionId: number | null;
  modes: readonly Mode[];
  projects: readonly Project[];
  sections: readonly Section[];
  onAssign: (task: Task, field: "mode" | "project" | "section", id: number | null) => void;
  onOperate: (task: Task, operation: "suspend" | "duplicate" | "postpone" | "delete") => void;
  /** ルーチン化（O-12 / §4.1） */
  onRoutinize: (task: Task, choice: RoutineFromTaskChoice) => void;
  isSelected: boolean;
  onSelect: (taskId: number) => void;
  editing: EditField | null;
  onBeginEdit: (task: Task, field: EditField) => void;
  onEndEdit: () => void;
  now: Date;
  stickyHeight: number;
}>) {
  const status = taskStatus(task);
  const actual = actualMinutes(task);
  const elapsed = elapsedMinutes(task, now);

  // 入力欄は非制御にして、確定時に値を読む（親が編集状態だけを持てば済む）
  function initialValue(field: EditField): string {
    if (field === "name") return task.name;
    if (field === "estimate") return String(task.estimateMinutes || "");
    if (field === "startedAt") return task.startedAt === null ? "" : formatClock(task.startedAt);
    if (field === "endedAt") return task.endedAt === null ? "" : formatClock(task.endedAt);
    return "";
  }

  function commit(input: HTMLInputElement) {
    const value = input.value;
    if (editing === "name") onRename(task, value);
    if (editing === "estimate") onEstimate(task, value);
    if (editing === "startedAt" || editing === "endedAt") onEditPunch(task, editing, value);
    onEndEdit();
  }

  const onKeyDown = inlineEditKeyHandler({ onEnter: commit, onEscape: onEndEdit });

  // 選択行が画面外にあるときはスクロールを追従させる（§5 / FB-20）。
  // J/K での移動だけでなく、自動セクション移動（§4.2）で行の位置が変わったときにも効かせたいので
  // 「選択されている間、その行の位置が変わったら」を条件にする（nearest なので見えていれば動かない）
  const rowRef = useRef<HTMLTableRowElement>(null);
  useEffect(() => {
    if (isSelected) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [isSelected, sectionId, index]);

  // モード設定時は行の色を継承させ、未設定時のみ既定のグレーにする
  const dimmed = mode === undefined ? "text-ink-muted" : "";

  return (
    <tr
      ref={rowRef}
      // モード色は行全体のテキスト色に反映する（F-401 / 画面定義書01 §2）。
      // scrollMarginTop は、上方向へ追従したとき行が固定領域（§2）の裏に隠れないための余白
      style={{ ...(mode === undefined ? {} : { color: mode.color }), scrollMarginTop: stickyHeight }}
      onClick={() => onSelect(task.id)}
      className={`border-b border-line ${isSelected ? "bg-accent-weak" : ""}`}
    >
      <td className="py-2.5">
        {/* 開始 →（実行中なら）終了 のトグル（F-201）。押しやすさのため円形ボタンにする */}
        <button
          type="button"
          onClick={() => onPunch(task)}
          disabled={status === "completed"}
          aria-label={status === "not_started" ? "開始" : status === "running" ? "終了" : "完了済み"}
          className={`flex h-7 w-7 items-center justify-center rounded-full ${
            status === "running"
              ? "bg-accent text-white"
              : status === "completed"
                ? "text-ink-faint"
                : "border border-line text-ink-muted hover:border-accent hover:text-accent"
          }`}
        >
          {STATUS_ICON[status]}
        </button>
      </td>
      <td className="py-2.5">
        {editing === "name" ? (
          <input
            autoFocus
            defaultValue={initialValue("name")}
            onKeyDown={onKeyDown}
            onBlur={(e) => commit(e.currentTarget)}
            className={`w-full ${inputBase}`}
          />
        ) : (
          <button type="button" onClick={() => onBeginEdit(task, "name")} className="text-left hover:underline">
            {task.name}
          </button>
        )}
        {/* 補助表記は本文より1段階だけ小さくする（画面定義書01 §2: 相対関係を維持する） */}
        {editing !== "name" && (
          <span className="relative ml-2 inline-flex gap-2 text-sm">
            {/* プロジェクト選択ポップオーバー（O-5） */}
            <button
              type="button"
              onClick={() => onBeginEdit(task, "project")}
              className={`hover:underline ${dimmed}`}
            >
              {project?.name ?? <span className="text-ink-faint">プロジェクト</span>}
            </button>
            {editing === "project" && (
              <SelectPopover
                options={toOptions(projects, "プロジェクトなし")}
                selectedId={task.projectId}
                onSelect={(id) => onAssign(task, "project", id)}
                onClose={onEndEdit}
              />
            )}
            {/* セクション選択ポップオーバー（O-5） */}
            <button
              type="button"
              onClick={() => onBeginEdit(task, "section")}
              className={`hover:underline ${dimmed} opacity-80`}
            >
              {sections.find((s) => s.id === task.sectionId)?.name ?? "未分類"}
            </button>
            {editing === "section" && (
              <SelectPopover
                options={toOptions(sections, "未分類")}
                selectedId={task.sectionId}
                onSelect={(id) => onAssign(task, "section", id)}
                onClose={onEndEdit}
              />
            )}
          </span>
        )}
      </td>
      <td className={`relative py-2.5 text-sm ${dimmed}`}>
        {/* モード選択ポップオーバー（O-5） */}
        <button type="button" onClick={() => onBeginEdit(task, "mode")} className="hover:underline">
          {mode?.name ?? <span className="text-ink-faint">モード</span>}
        </button>
        {editing === "mode" && (
          <SelectPopover
            options={toOptions(modes, "モードなし", true)}
            selectedId={task.modeId}
            onSelect={(id) => onAssign(task, "mode", id)}
            onClose={onEndEdit}
          />
        )}
      </td>
      <td className="py-2.5 text-right font-mono tabular-nums">
        {editing === "estimate" ? (
          <input
            autoFocus
            inputMode="numeric"
            defaultValue={initialValue("estimate")}
            onKeyDown={onKeyDown}
            onBlur={(e) => commit(e.currentTarget)}
            placeholder="分"
            className={`w-14 text-right ${inputBase}`}
          />
        ) : (
          <button
            type="button"
            onClick={() => onBeginEdit(task, "estimate")}
            className={`hover:underline ${task.estimateMinutes <= 0 ? "text-ink-faint" : ""}`}
          >
            {formatEstimate(task.estimateMinutes)}
          </button>
        )}
      </td>
      <td className={`py-2.5 text-right font-mono tabular-nums ${dimmed}`}>
        {actual !== null && (
          <span className={isOverEstimate(actual, task) ? "text-danger" : ""}>
            → {formatDuration(actual)}
          </span>
        )}
        {/* 実行中は経過をクライアントタイマーで表示（F-205） */}
        {elapsed !== null && (
          <span className={isOverEstimate(elapsed, task) ? "text-danger" : ""}>
            (経過 {formatDuration(elapsed)})
          </span>
        )}
      </td>
      <td className={`py-2.5 text-right font-mono tabular-nums ${dimmed}`}>
        {/* 開始・終了時刻のインライン修正（F-203）。未打刻のタスクは編集させない */}
        {task.startedAt !== null &&
          (editing === "startedAt" || editing === "endedAt" ? (
            <input
              autoFocus
              key={editing}
              defaultValue={initialValue(editing)}
              // 打ち直しが前提の項目なので既存値を全選択して始める（§3.3 / FB-23）
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={onKeyDown}
              onBlur={(e) => commit(e.currentTarget)}
              placeholder="1935"
              className={`w-16 text-right ${inputBase}`}
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => onBeginEdit(task, "startedAt")}
                className="hover:underline"
              >
                {formatClock(task.startedAt)}
              </button>
              –
              {task.endedAt !== null && (
                <button
                  type="button"
                  onClick={() => onBeginEdit(task, "endedAt")}
                  className="hover:underline"
                >
                  {formatClock(task.endedAt)}
                </button>
              )}
            </>
          ))}
      </td>
      <td className="relative py-2.5">
        <RowMenu
          items={[
            {
              label: "ルーチン化",
              onSelect: () => onBeginEdit(task, "routinize"),
              // ルーチン由来のタスクからは作れない。項目は見せて非活性にする（§4.1 / FB-30）
              disabled: task.routineId !== null,
            },
            {
              label: "中断",
              onSelect: () => onOperate(task, "suspend"),
              disabled: status !== "running", // 実行中のみ（F-204）
            },
            { label: "複製", onSelect: () => onOperate(task, "duplicate") },
            {
              label: "翌日へ先送り",
              onSelect: () => onOperate(task, "postpone"),
              disabled: status !== "not_started", // 未実行のみ（F-107）
            },
            {
              label: "削除",
              onSelect: () => onOperate(task, "delete"),
              // 打刻済みは確認ダイアログ（O-8）
              confirmMessage:
                status === "not_started"
                  ? undefined
                  : `「${task.name}」は打刻済みです。削除しますか？`,
            },
          ]}
        />
        {/* ルーチン化ポップオーバー（O-12 / §4.1） */}
        {editing === "routinize" && (
          <RoutinizePopover
            task={task}
            sections={sections}
            now={now}
            onSubmit={(choice) => {
              onRoutinize(task, choice);
              onEndEdit();
            }}
            onClose={onEndEdit}
          />
        )}
      </td>
    </tr>
  );
}
