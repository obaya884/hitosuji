"use server";

import { revalidatePath } from "next/cache";
import {
  createRoutine,
  deleteRoutine,
  setRoutineActive,
  updateRoutine,
} from "@/usecases/routine/routine-usecases";
import type { RoutineInput } from "@/domain/routine/input";
import { createRoutineRepository } from "@/infrastructure/db/repositories/drizzle-routine-repository";
import type { ActionResult } from "@/app/_lib/action-result";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
const repo = createRoutineRepository();
const PATH = "/routines";

export type RoutineActionResult = ActionResult;

const MESSAGES: Record<string, string> = {
  name_required: "名前を入力してください",
  name_too_long: "名前は50文字以内で入力してください",
  invalid_estimate: "見積もりは1分以上の整数で入力してください",
  invalid_start_time: "開始想定時刻を HH:MM 形式で入力してください",
  invalid_start_date: "開始日を正しく入力してください",
  invalid_end_date: "終了日を正しく入力してください",
  end_date_before_start_date: "終了日は開始日以降にしてください",
  weekdays_required: "曜日を1つ以上選んでください",
  invalid_week_interval: "週間隔は1〜53の整数で入力してください",
  invalid_month_day: "日は1〜31で入力してください",
  invalid_interval_days: "間隔は1日以上で入力してください",
  routine_not_found: "ルーチンが見つかりませんでした",
};

export async function createRoutineAction(input: RoutineInput): Promise<RoutineActionResult> {
  const result = await createRoutine(repo, input);
  if (!result.ok) return { ok: false, message: MESSAGES[result.error] };
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateRoutineAction(
  id: number,
  input: RoutineInput
): Promise<RoutineActionResult> {
  const result = await updateRoutine(repo, id, input);
  if (!result.ok) return { ok: false, message: MESSAGES[result.error] };
  revalidatePath(PATH);
  return { ok: true };
}

export async function setRoutineActiveAction(
  id: number,
  isActive: boolean
): Promise<RoutineActionResult> {
  const result = await setRoutineActive(repo, id, isActive);
  if (!result.ok) return { ok: false, message: MESSAGES[result.error] };
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteRoutineAction(id: number): Promise<RoutineActionResult> {
  const result = await deleteRoutine(repo, id);
  if (!result.ok) return { ok: false, message: MESSAGES[result.error] };
  revalidatePath(PATH);
  return { ok: true };
}
