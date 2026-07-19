"use server";

import { revalidatePath } from "next/cache";
import { addTask } from "@/application/task/daily-list-usecases";
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
