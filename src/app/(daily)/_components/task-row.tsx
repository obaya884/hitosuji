"use client";

import { useEffect, useRef } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { RoutineFromTaskChoice } from "@/domain/routine/from-task";
import type { Section } from "@/domain/section/section";
import { taskStatus } from "@/domain/task/status";
import { actualMinutes, elapsedMinutes, type Task } from "@/domain/task/task";
import { CheckIcon, PlayIcon, StopIcon } from "@/app/_components/icons";
import { formatClock, formatDuration, formatEstimate } from "@/app/_lib/format";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { modeAppearance } from "@/app/_lib/mode-appearance";
import { inputBase } from "@/app/_lib/ui";
import type { EditField } from "../_lib/editing";
import { toModeOptions, toProjectOptions } from "../_lib/master-options";
import { AssignCell } from "./assign-cell";
import { RowMenu } from "./row-menu";
import { RoutinizePopover } from "./routinize-popover";
import { SelectPopover, type PopoverOption } from "./select-popover";

/**
 * 行の props。**リスト（`DailyList`）はこの型から自分の Props を派生させる**ので、
 * 行へそのまま流す項目はここが単一の真実（同じ内容を2度書かない。T-53）
 */
export type TaskRowProps = Readonly<{
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
  /** セクション選択の候補（O-5 / §4.3）。固定項目が現在セクションに依るため親が組む */
  sectionOptions: readonly PopoverOption[];
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
  /** 予想開始時刻の表示（F-120 / §3.3）。出さない行（実行中・完了・今日以外）は null */
  projectedStart: string | null;
  /** 画面上端の固定領域の高さ（px）。選択行の追従がその裏で止まらないようにする（§2 / §5） */
  stickyHeight: number;
}>;

// ボタンが示すのは「押したときの動作」: 未実行→開始(再生) / 実行中→終了(停止) / 完了は操作なし(チェック)
const STATUS_ICON = {
  not_started: <PlayIcon className="h-3 w-3" />,
  running: <StopIcon className="h-3 w-3" />,
  completed: <CheckIcon className="h-3 w-3" />,
} as const;

/** 見積もり超過は警告色（F-202）。見積もり未設定（0分）は超過判定しない */
function isOverEstimate(minutes: number, task: Task): boolean {
  return task.estimateMinutes > 0 && minutes > task.estimateMinutes;
}

/**
 * タスク1件の行（画面定義書01 §3.3）。1タスク=1行で、セルのクリックが編集・割り当ての入口になる。
 * インライン編集の入力欄はいずれも非制御にして確定時に値を読む（親が編集状態だけを持てば済む）
 */
export function TaskRow({
  task,
  index,
  sectionId,
  mode,
  project,
  modes,
  projects,
  sections,
  sectionOptions,
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
  projectedStart,
  stickyHeight,
}: TaskRowProps) {
  const status = taskStatus(task);
  const actual = actualMinutes(task);
  const elapsed = elapsedMinutes(task, now);

  // 修正できるのは打刻済みの時刻だけなので、編集中でも打刻がなければ null（＝入力欄を出さない。§3.3）
  const editingPunchAt =
    editing === "startedAt" ? task.startedAt : editing === "endedAt" ? task.endedAt : null;

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

  // モードから決まる見た目（規則は `_lib/mode-appearance.ts`）。
  // `AssignCell` は boolean を受け取って自分でクラスを決めるので、文字列が要るのは他のセルだけ
  const { isDimmed, dimmedClass, colorStyle } = modeAppearance(mode);

  return (
    <tr
      ref={rowRef}
      // モード色は行全体のテキスト色に反映する（F-401 / 画面定義書01 §2）。
      // scrollMarginTop は、上方向へ追従したとき行が固定領域（§2）の裏に隠れないための余白
      style={{ ...colorStyle, scrollMarginTop: stickyHeight }}
      onClick={() => onSelect(task.id)}
      className={`border-b border-line ${isSelected ? "bg-accent-weak" : ""}`}
    >
      <td className="py-2.5">
        {/* 開始 →（実行中なら）終了 のトグル（F-201）。押しやすさのため円形ボタンにする */}
        <button
          type="button"
          onClick={(e) => {
            // 行クリックの再選択（tr の onClick）が、終了打刻後の選択送り（F-211）を
            // 上書きしないよう伝播を止める。選択自体はここで明示する（マウス／キーボード等価。§5）
            e.stopPropagation();
            onSelect(task.id);
            onPunch(task);
          }}
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
            defaultValue={task.name}
            onKeyDown={onKeyDown}
            onBlur={(e) => commit(e.currentTarget)}
            className={`w-full ${inputBase}`}
          />
        ) : (
          <button type="button" onClick={() => onBeginEdit(task, "name")} className="text-left hover:underline">
            {task.name}
          </button>
        )}
        {/* セクションの併記はタスク名セルに残す。補助表記は本文より1段階だけ小さくする
            （画面定義書01 §2: 相対関係を維持する） */}
        {editing !== "name" && (
          <span className="relative ml-2 inline-block text-sm">
            {/* セクション選択ポップオーバー（O-5） */}
            <button
              type="button"
              onClick={() => onBeginEdit(task, "section")}
              className={`hover:underline ${dimmedClass} opacity-80`}
            >
              {sections.find((s) => s.id === task.sectionId)?.name ?? "未分類"}
            </button>
            {editing === "section" && (
              <SelectPopover
                options={sectionOptions}
                selectedId={task.sectionId}
                onSelect={(id) => onAssign(task, "section", id)}
                onClose={onEndEdit}
              />
            )}
          </span>
        )}
      </td>
      <AssignCell
        label="プロジェクト"
        name={project?.name}
        options={toProjectOptions(projects)}
        selectedId={task.projectId}
        isDimmed={isDimmed}
        isEditing={editing === "project"}
        onOpen={() => onBeginEdit(task, "project")}
        onSelect={(id) => onAssign(task, "project", id)}
        onClose={onEndEdit}
      />
      <AssignCell
        label="モード"
        name={mode?.name}
        options={toModeOptions(modes)}
        selectedId={task.modeId}
        isDimmed={isDimmed}
        isEditing={editing === "mode"}
        onOpen={() => onBeginEdit(task, "mode")}
        onSelect={(id) => onAssign(task, "mode", id)}
        onClose={onEndEdit}
      />
      <td className="py-2.5 text-right font-mono tabular-nums">
        {editing === "estimate" ? (
          <input
            autoFocus
            inputMode="numeric"
            defaultValue={String(task.estimateMinutes || "")}
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
      <td className={`py-2.5 text-right font-mono tabular-nums ${dimmedClass}`}>
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
      <td className={`py-2.5 text-right font-mono tabular-nums ${dimmedClass}`}>
        {/* 開始・終了時刻のインライン修正（F-203）。未打刻のタスクは編集させない */}
        {task.startedAt !== null &&
          (editingPunchAt !== null ? (
            <input
              autoFocus
              key={editing}
              defaultValue={formatClock(editingPunchAt)}
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
        {/* 未実行行は実打刻と同じ位置に予想開始時刻を弱色で併記する（F-120 / §3.3。出す行の判定は親） */}
        {projectedStart !== null && <span className="text-ink-faint">{projectedStart}</span>}
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
