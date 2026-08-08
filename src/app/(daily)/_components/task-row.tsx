"use client";

import { useEffect, useRef } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { RoutineFromTaskChoice } from "@/domain/routine/from-task";
import type { Section, SectionId } from "@/domain/section/section";
import { taskStatus } from "@/domain/task/status";
import { actualMinutes, elapsedMinutes, type Task, type TaskId } from "@/domain/task/task";
import { DurationValue } from "@/app/_components/duration-value";
import { CheckIcon, CommentIcon, PlayIcon, StarIcon, StopIcon } from "@/app/_components/icons";
import { formatClock, formatDuration } from "@/app/_lib/format";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { modeAppearance } from "@/app/_lib/mode-appearance";
import { inputBase } from "@/app/_lib/ui";
import { UNCATEGORIZED_LABEL } from "@/app/_lib/unset";
import { showsCommentRow, type EditField } from "../_lib/editing";
import { toModeOptions, toProjectOptions } from "../_lib/master-options";
import { rowBackgroundClass } from "../_lib/row-background";
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
  sectionId: SectionId | null;
  modes: readonly Mode[];
  projects: readonly Project[];
  sections: readonly Section[];
  /** セクション選択の候補（O-5 / §4.3）。固定項目が現在セクションに依るため親が組む */
  sectionOptions: readonly PopoverOption[];
  onAssign: (task: Task, field: "mode" | "project" | "section", id: number | null) => void;
  onOperate: (task: Task, operation: "suspend" | "duplicate" | "postpone" | "delete") => void;
  /** ハイライトの付け外し（O-17 / F-118） */
  onToggleHighlight: (task: Task) => void;
  /** ルーチン化（O-12 / §4.1） */
  onRoutinize: (task: Task, choice: RoutineFromTaskChoice) => void;
  isSelected: boolean;
  onSelect: (taskId: TaskId) => void;
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
  onToggleHighlight,
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
      // コメント行を開くときは下線をそちらに譲る（2本の線でタスクとコメントが分断されないように）
      className={`${
        showsCommentRow(task, isSelected, editing) ? "" : "border-b border-line"
      } ${rowBackgroundClass(task, isSelected)}`}
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
          <button
            type="button"
            onClick={() => onBeginEdit(task, "name")}
            className="text-left hover:underline"
          >
            {task.name}
          </button>
        )}
        {/* 名前の編集中は併記を隠して入力欄だけにする。タスク名に添えるセクション名は従段
            （00_共通 §1.1） */}
        {editing !== "name" && (
          <>
            {/* セクションの併記はタスク名セルに残す */}
            <span className="relative ml-2 inline-block text-sm">
              {/* セクション選択ポップオーバー（O-5） */}
              <button
                type="button"
                onClick={() => onBeginEdit(task, "section")}
                className={`hover:underline ${dimmedClass} opacity-80`}
              >
                {sections.find((s) => s.id === task.sectionId)?.name ?? UNCATEGORIZED_LABEL}
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
            {/* コメントのある行にだけ印を出す（F-206 / §3.3）。全文は選択行で下に開く（O-16）。
                印は隣の文字（セクション併記）と縦中央で揃える——`inline-flex` にすると行内で
                ベースラインに引っ張られないので、`align-middle` と組で位置が決まる */}
            {task.comment !== null && (
              <button
                type="button"
                onClick={() => onBeginEdit(task, "comment")}
                aria-label="コメントを編集"
                className={`ml-2 inline-flex align-middle ${dimmedClass} opacity-80`}
              >
                <CommentIcon className="h-4 w-4" />
              </button>
            )}
            {/* ハイライトの⭐（F-118 / §3.3）。**出す条件は HighlightStar 側が持つ**
                （ON の行と選択行にだけ出る） */}
            <HighlightStar
              task={task}
              isSelected={isSelected}
              onSelect={onSelect}
              onToggleHighlight={onToggleHighlight}
            />
          </>
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
            className="hover:underline"
          >
            <DurationValue minutes={task.estimateMinutes} />
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
              // ハイライトの付け外し（O-17 / F-118）。⭐・`H` と同じトグル
              label: task.highlighted ? "ハイライトを外す" : "ハイライト",
              onSelect: () => onToggleHighlight(task),
            },
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

/**
 * ハイライトの⭐（F-118 / §3.3 / O-17）。コメント印の右に並べ、ON/OFF をトグルする。
 * **クリックは打刻ボタンと同じく行の選択もその行へ移す**（押した行が操作対象になったことを示す）
 */
function HighlightStar({
  task,
  isSelected,
  onSelect,
  onToggleHighlight,
}: Pick<TaskRowProps, "task" | "isSelected" | "onSelect" | "onToggleHighlight">) {
  // OFF の輪郭は選択行にだけ出す（§3.3）。⭐は流し込みの末尾なので、
  // 出し入れしても左の表記は動かない——場所を空けておく必要がない
  if (!task.highlighted && !isSelected) return null;

  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onSelect(task.id);
        onToggleHighlight(task);
      }}
      aria-label="ハイライト"
      aria-pressed={task.highlighted}
      // コメント印と同じ余白・同じ縦位置に並べる（印がひとまとまりに見えるように）
      className={`ml-2 inline-flex align-middle ${
        task.highlighted ? "text-highlight-mark" : "text-ink-faint"
      }`}
    >
      <StarIcon filled={task.highlighted} className="h-4 w-4" />
    </button>
  );
}
