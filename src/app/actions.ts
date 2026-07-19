"use server";

import { revalidatePath } from "next/cache";
import {
  addTask,
  renameTask,
  updateTaskEstimate,
} from "@/application/task/daily-list-usecases";
import { finishTask, startTask } from "@/application/task/punch-usecases";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { createTaskRepository } from "@/infrastructure/db/repositories/drizzle-task-repository";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
const taskRepo = createTaskRepository();

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
