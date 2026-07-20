"use server";

import { revalidatePath } from "next/cache";
import {
  addTask,
  renameTask,
  setTaskMode,
  setTaskProject,
  updateTaskEstimate,
} from "@/usecases/task/daily-list-usecases";
import {
  finishTask,
  startTask,
  updateTaskPunch,
} from "@/usecases/task/punch-usecases";
import {
  deleteTask,
  duplicateTask,
  postponeTask,
  restoreTask,
  suspendTask,
} from "@/usecases/task/task-operations";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task } from "@/domain/task/task";
import {
  moveTaskByOneStep,
  moveTaskTo,
  setTaskSection,
} from "@/usecases/task/reorder-usecases";
import { createRoutineFromTask } from "@/usecases/routine/routine-usecases";
import { applyCarryOverAfterPunch } from "@/usecases/task/relocation-usecases";
import { formatClock, todayLogicalDate } from "@/app/_lib/format";
import type { RoutineFromTaskChoice } from "@/domain/routine/routine-from-task";
import { createRoutineRepository } from "@/infrastructure/db/repositories/drizzle-routine-repository";
import { createSectionRepository } from "@/infrastructure/db/repositories/drizzle-section-repository";
import { createTaskRepository } from "@/infrastructure/db/repositories/drizzle-task-repository";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
const taskRepo = createTaskRepository();
const sectionRepo = createSectionRepository();
const routineRepo = createRoutineRepository();
/** 打刻と自動セクション移動（F-113）はセクションも参照する */
const punchDeps = { tasks: taskRepo, sections: sectionRepo };

export type DailyActionResult = Readonly<{ ok: true } | { ok: false; message: string }>;

export async function addTaskAction(
  input: Readonly<{ date: LogicalDate; name: string }>
): Promise<DailyActionResult> {
  const result = await addTask(taskRepo, input);
  if (!result.ok) return { ok: false, message: "タスク名を入力してください" };
  revalidatePath("/");
  return { ok: true };
}

export async function renameTaskAction(
  id: number,
  name: string
): Promise<DailyActionResult> {
  const result = await renameTask(taskRepo, id, name);
  if (!result.ok) return { ok: false, message: "タスク名を入力してください" };
  revalidatePath("/");
  return { ok: true };
}

export async function updateTaskEstimateAction(
  id: number,
  rawMinutes: string
): Promise<DailyActionResult> {
  const result = await updateTaskEstimate(taskRepo, id, rawMinutes);
  if (!result.ok) return { ok: false, message: "見積もりは分（0以上の整数）で入力してください" };
  revalidatePath("/");
  return { ok: true };
}

const PUNCH_ERROR_MESSAGES: Record<string, string> = {
  task_not_found: "タスクが見つかりませんでした",
  already_started: "このタスクはすでに開始済みです",
  not_running: "実行中のタスクではありません",
  ended_before_started: "終了時刻が開始時刻より前になります",
  invalid_time: "時刻は HH:MM 形式で入力してください",
  not_punched: "打刻されていないため修正できません",
  no_started_at: "開始時刻のないタスクに終了時刻は設定できません",
};

/** 開始打刻（F-201）。now はクライアントの現在時刻を受け取る */
export async function startTaskAction(id: number, now: Date): Promise<DailyActionResult> {
  const today = todayLogicalDate(now);
  const nowClock = formatClock(now);
  const result = await startTask(punchDeps, { taskId: id, now, nowClock, today });
  if (!result.ok) return { ok: false, message: PUNCH_ERROR_MESSAGES[result.error] };
  // 開始したタスクより前に残っている未実行タスクを繰り下げる（F-113 §4.2-b）
  await applyCarryOverAfterPunch(punchDeps, { date: today, today, nowClock });
  revalidatePath("/");
  return { ok: true };
}

export async function finishTaskAction(id: number, now: Date): Promise<DailyActionResult> {
  const result = await finishTask(taskRepo, { taskId: id, now });
  if (!result.ok) return { ok: false, message: PUNCH_ERROR_MESSAGES[result.error] };
  const today = todayLogicalDate(now);
  await applyCarryOverAfterPunch(punchDeps, { date: today, today, nowClock: formatClock(now) });
  revalidatePath("/");
  return { ok: true };
}

/** 打刻時刻の修正（F-203）。HH:MM の解釈はクライアント側で済ませ、絶対時刻を受け取る */
export async function updateTaskPunchAction(
  id: number,
  punch: Readonly<{ startedAt: Date; endedAt: Date | null }>
): Promise<DailyActionResult> {
  const result = await updateTaskPunch(taskRepo, { taskId: id, ...punch });
  if (!result.ok) return { ok: false, message: PUNCH_ERROR_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

const REORDER_ERROR_MESSAGES: Record<string, string> = {
  task_not_found: "タスクが見つかりませんでした",
};

/** ドラッグ＆ドロップでの並び替え（O-6） */
export async function moveTaskAction(
  input: Readonly<{
    taskId: number;
    date: LogicalDate;
    sectionId: number | null;
    index: number;
  }>
): Promise<DailyActionResult> {
  const result = await moveTaskTo(taskRepo, input);
  if (!result.ok) return { ok: false, message: REORDER_ERROR_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

/** Shift+J/K での並び替え（O-6） */
export async function moveTaskByStepAction(
  input: Readonly<{ taskId: number; date: LogicalDate; step: 1 | -1 }>
): Promise<DailyActionResult> {
  const result = await moveTaskByOneStep(
    { tasks: taskRepo, sections: sectionRepo },
    input
  );
  if (!result.ok) return { ok: false, message: REORDER_ERROR_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

/** モード・プロジェクト・セクションの割り当て（O-5） */
export async function setTaskModeAction(
  id: number,
  modeId: number | null
): Promise<DailyActionResult> {
  await setTaskMode(taskRepo, id, modeId);
  revalidatePath("/");
  return { ok: true };
}

export async function setTaskProjectAction(
  id: number,
  projectId: number | null
): Promise<DailyActionResult> {
  await setTaskProject(taskRepo, id, projectId);
  revalidatePath("/");
  return { ok: true };
}

export async function setTaskSectionAction(
  input: Readonly<{ taskId: number; date: LogicalDate; sectionId: number | null }>
): Promise<DailyActionResult> {
  const result = await setTaskSection(taskRepo, input);
  if (!result.ok) return { ok: false, message: REORDER_ERROR_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

const OPERATION_ERROR_MESSAGES: Record<string, string> = {
  ...PUNCH_ERROR_MESSAGES,
  not_postponable: "先送りできるのは未実行タスクだけです",
};

/** ルーチン化の失敗（画面定義書01 §4.1）。入力値の検証エラーは画面定義書02 §4 の項目に対応する */
const ROUTINE_FROM_TASK_ERROR_MESSAGES: Record<string, string> = {
  task_not_found: "タスクが見つかりませんでした",
  estimate_required: "見積もりを入力してからルーチン化してください",
  routine_derived_task: "ルーチン由来のタスクはルーチン化できません（ルーチン画面で編集してください）",
  weekdays_required: "曜日を1つ以上選んでください",
  invalid_start_time: "開始想定時刻を HH:MM で入力してください",
  invalid_interval_days: "間隔は1日以上で入力してください",
  invalid_month_day: "日は1〜31で入力してください",
};

/** 中断（F-204） */
export async function suspendTaskAction(id: number, now: Date): Promise<DailyActionResult> {
  const result = await suspendTask(taskRepo, { taskId: id, now });
  if (!result.ok) return { ok: false, message: OPERATION_ERROR_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

/** 複製（F-111）。複製後に選択行を移すため、作られたタスクのIDを返す（O-11） */
export async function duplicateTaskAction(
  id: number
): Promise<Readonly<{ ok: true; createdId: number } | { ok: false; message: string }>> {
  const result = await duplicateTask({ tasks: taskRepo, sections: sectionRepo }, { taskId: id });
  if (!result.ok) return { ok: false, message: OPERATION_ERROR_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true, createdId: result.value.id };
}

/**
 * ルーチン化（F-305 / 画面定義書01 §4.1）。
 * 楽観的更新の対象外なので、サーバ確定を待って結果を返す
 */
export async function createRoutineFromTaskAction(
  id: number,
  choice: RoutineFromTaskChoice
): Promise<DailyActionResult> {
  const result = await createRoutineFromTask(
    { routines: routineRepo, tasks: taskRepo },
    id,
    choice
  );
  if (!result.ok) {
    // 名前・日付の検証エラーはタスク由来の値なので通常起きない。取りこぼしても既定文言を出す
    return {
      ok: false,
      message: ROUTINE_FROM_TASK_ERROR_MESSAGES[result.error] ?? "ルーチン化に失敗しました",
    };
  }
  // ルーチン一覧にも即座に現れるようにする（展開は翌日以降）
  revalidatePath("/routines");
  return { ok: true };
}

/** 先送り（F-107） */
export async function postponeTaskAction(id: number): Promise<DailyActionResult> {
  const result = await postponeTask(taskRepo, { taskId: id });
  if (!result.ok) return { ok: false, message: OPERATION_ERROR_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

/** 削除（O-8）。Undo のために削除したタスクを返す */
export async function deleteTaskAction(
  id: number
): Promise<Readonly<{ ok: true; deleted: Task } | { ok: false; message: string }>> {
  const result = await deleteTask(taskRepo, { taskId: id });
  if (!result.ok) return { ok: false, message: OPERATION_ERROR_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true, deleted: result.value };
}

/** 削除の取り消し（O-8） */
export async function restoreTaskAction(deleted: Task): Promise<DailyActionResult> {
  const result = await restoreTask(taskRepo, deleted);
  if (!result.ok) return { ok: false, message: OPERATION_ERROR_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}
