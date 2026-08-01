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
import { ROUTINE_MESSAGES } from "@/app/_lib/error-messages";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
const repo = createRoutineRepository();
const PATH = "/routines";

export type RoutineActionResult = ActionResult;

export async function createRoutineAction(input: RoutineInput): Promise<RoutineActionResult> {
  const result = await createRoutine(repo, input);
  if (!result.ok) return { ok: false, message: ROUTINE_MESSAGES[result.error] };
  revalidatePath(PATH);
  return { ok: true };
}

export async function updateRoutineAction(
  id: number,
  input: RoutineInput
): Promise<RoutineActionResult> {
  const result = await updateRoutine(repo, id, input);
  if (!result.ok) return { ok: false, message: ROUTINE_MESSAGES[result.error] };
  revalidatePath(PATH);
  return { ok: true };
}

export async function setRoutineActiveAction(
  id: number,
  isActive: boolean
): Promise<RoutineActionResult> {
  const result = await setRoutineActive(repo, id, isActive);
  if (!result.ok) return { ok: false, message: ROUTINE_MESSAGES[result.error] };
  revalidatePath(PATH);
  return { ok: true };
}

export async function deleteRoutineAction(id: number): Promise<RoutineActionResult> {
  const result = await deleteRoutine(repo, id);
  if (!result.ok) return { ok: false, message: ROUTINE_MESSAGES[result.error] };
  revalidatePath(PATH);
  return { ok: true };
}
