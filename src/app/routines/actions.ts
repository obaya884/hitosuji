"use server";

import { revalidatePath } from "next/cache";
import {
  copyRoutineToDate,
  createRoutine,
  deleteRoutine,
  setRoutineActive,
  updateRoutine,
} from "@/usecases/routine/routine-usecases";
import type { RoutineInput } from "@/domain/routine/input";
import type { RoutineId } from "@/domain/routine/routine";
import { resolveToday } from "@/usecases/section/resolve-today";
import { createRoutineRepository } from "@/infrastructure/db/repositories/drizzle-routine-repository";
import { createSectionRepository } from "@/infrastructure/db/repositories/drizzle-section-repository";
import { createTaskRepository } from "@/infrastructure/db/repositories/drizzle-task-repository";
import { failure, type ActionResult } from "@/app/_lib/action-result";
import { DAILY_PATH } from "@/app/_lib/date-href";
import { ROUTINE_MESSAGES } from "@/app/_lib/error-messages";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
// 各アクションの形は同書 §4「Server Action の形」（早期 return にしない）
const repo = createRoutineRepository();
// 今日へコピー（O-6）はタスクを作り、日界を踏まえた「今日」をセクションから解決する
const taskRepo = createTaskRepository();
const sectionRepo = createSectionRepository();
const PATH = "/routines";

export type RoutineActionResult = ActionResult;

export async function createRoutineAction(input: RoutineInput): Promise<RoutineActionResult> {
  const result = await createRoutine(repo, input);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(ROUTINE_MESSAGES[result.error]);
  }
}

export async function updateRoutineAction(
  id: RoutineId,
  input: RoutineInput
): Promise<RoutineActionResult> {
  const result = await updateRoutine(repo, id, input);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(ROUTINE_MESSAGES[result.error]);
  }
}

export async function setRoutineActiveAction(
  id: RoutineId,
  isActive: boolean
): Promise<RoutineActionResult> {
  const result = await setRoutineActive(repo, id, isActive);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(ROUTINE_MESSAGES[result.error]);
  }
}

/**
 * 今日へコピー（O-6 / F-307）。
 * 作られるタスクは今日のデイリーに出るので、再検証するのはそちらのパス
 * （この一覧は変わらない）。**画面の移動は呼び出し側**が成功後に行う（画面定義書02 O-6）
 */
export async function copyRoutineToTodayAction(
  id: RoutineId,
  now: Date
): Promise<RoutineActionResult> {
  // 「今日」は日界（F-116）を踏まえて解決する。`now` はクライアントの現在時刻
  // （サーバ時刻を使わない。デイリーの打刻系アクションと同じ扱い）
  const today = await resolveToday(sectionRepo, now);
  const result = await copyRoutineToDate({ routines: repo, tasks: taskRepo }, id, today);
  if (result.ok) {
    revalidatePath(DAILY_PATH);
    return { ok: true };
  } else {
    return failure(ROUTINE_MESSAGES[result.error]);
  }
}

export async function deleteRoutineAction(id: RoutineId): Promise<RoutineActionResult> {
  const result = await deleteRoutine(repo, id);
  if (result.ok) {
    revalidatePath(PATH);
    return { ok: true };
  } else {
    return failure(ROUTINE_MESSAGES[result.error]);
  }
}
