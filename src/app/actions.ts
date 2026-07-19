"use server";

import { revalidatePath } from "next/cache";
import {
  addTask,
  renameTask,
  setTaskMode,
  setTaskProject,
  updateTaskEstimate,
} from "@/application/task/daily-list-usecases";
import {
  finishTask,
  startTask,
  updateTaskPunch,
} from "@/application/task/punch-usecases";
import {
  deleteTask,
  duplicateTask,
  postponeTask,
  restoreTask,
  suspendTask,
} from "@/application/task/task-operations";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task } from "@/domain/task/task";
import {
  moveTaskByOneStep,
  moveTaskTo,
  setTaskSection,
} from "@/application/task/reorder-usecases";
import { createSectionRepository } from "@/infrastructure/db/repositories/drizzle-section-repository";
import { createTaskRepository } from "@/infrastructure/db/repositories/drizzle-task-repository";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
const taskRepo = createTaskRepository();
const sectionRepo = createSectionRepository();

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
  needs_renumber: "並び順の再採番が必要です。時間をおいて再試行してください",
  invalid_time: "時刻は HH:MM 形式で入力してください",
  not_punched: "打刻されていないため修正できません",
  no_started_at: "開始時刻のないタスクに終了時刻は設定できません",
};

/** 開始打刻（F-201）。now はクライアントの現在時刻を受け取る */
export async function startTaskAction(id: number, now: Date): Promise<DailyActionResult> {
  const result = await startTask(taskRepo, { taskId: id, now });
  if (!result.ok) return { ok: false, message: PUNCH_ERROR_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

export async function finishTaskAction(id: number, now: Date): Promise<DailyActionResult> {
  const result = await finishTask(taskRepo, { taskId: id, now });
  if (!result.ok) return { ok: false, message: PUNCH_ERROR_MESSAGES[result.error] };
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
  const result = await duplicateTask(taskRepo, { taskId: id });
  if (!result.ok) return { ok: false, message: OPERATION_ERROR_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true, createdId: result.value.id };
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
