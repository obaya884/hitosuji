// ルーチン管理のユースケース（S-02 / 画面定義書02 §5）
import type { RoutineRepository } from "@/usecases/ports/routine-repository";
import type { TaskRepository } from "@/usecases/ports/task-repository";
import type { Routine, RoutineError, RoutineId } from "@/domain/routine/routine";
import {
  routineInputFromTask,
  type RoutineFromTaskChoice,
  type RoutineFromTaskError,
} from "@/domain/routine/routine-from-task";
import { validateRoutineInput, type RoutineInput } from "@/domain/routine/routine-input";
import { compareByName } from "@/domain/shared/name-order";
import { err, ok, type Result } from "@/domain/shared/result";
import type { TaskId } from "@/domain/task/task";

export type RoutineUsecaseError = RoutineError | "routine_not_found";

export type CreateRoutineFromTaskError =
  | RoutineUsecaseError
  | RoutineFromTaskError
  | "task_not_found";

/**
 * 一覧（画面定義書02 §3）。
 * 並び順は開始想定時刻の昇順（同時刻は名前の自然順）＝展開後のデイリーリストと同じ並び
 */
export async function listRoutines(repo: RoutineRepository): Promise<Routine[]> {
  const all = await repo.listAll();
  return [...all].sort(
    (a, b) => a.scheduledStartTime.localeCompare(b.scheduledStartTime) || compareByName(a, b)
  );
}

export async function createRoutine(
  repo: RoutineRepository,
  input: RoutineInput
): Promise<Result<Routine, RoutineUsecaseError>> {
  const validated = validateRoutineInput(input);
  if (!validated.ok) return validated;
  return ok(await repo.create(validated.value));
}

/** 編集内容は未展開の日から反映される。展開済みタスクは変更しない（画面定義書02 O-2） */
export async function updateRoutine(
  repo: RoutineRepository,
  id: RoutineId,
  input: RoutineInput
): Promise<Result<RoutineId, RoutineUsecaseError>> {
  const target = await repo.findById(id);
  if (target === null) return err("routine_not_found");

  const validated = validateRoutineInput(input);
  if (!validated.ok) return validated;

  await repo.update(id, validated.value);
  return ok(id);
}

/** 有効/無効の切替（O-3）。無効化以後は展開されない。既存タスクは残る */
export async function setRoutineActive(
  repo: RoutineRepository,
  id: RoutineId,
  isActive: boolean
): Promise<Result<RoutineId, RoutineUsecaseError>> {
  const target = await repo.findById(id);
  if (target === null) return err("routine_not_found");

  await repo.setActive(id, isActive);
  return ok(id);
}

/**
 * タスクからのルーチン化（F-305 / 画面定義書01 §4.1・O-12, 画面定義書02 O-5）。
 * 名前・見積もり・モード・プロジェクトを引き継ぎ、開始日は翌日にする（当日の二重展開を防ぐ）
 */
export async function createRoutineFromTask(
  deps: Readonly<{ routines: RoutineRepository; tasks: TaskRepository }>,
  taskId: TaskId,
  choice: RoutineFromTaskChoice
): Promise<Result<Routine, CreateRoutineFromTaskError>> {
  const task = await deps.tasks.findById(taskId);
  if (task === null) return err("task_not_found");

  const input = routineInputFromTask(task, choice);
  if (!input.ok) return input;

  return createRoutine(deps.routines, input.value);
}

/** 削除（O-4）。展開済みタスクは routine_id を NULL にして残る（ログ保全） */
export async function deleteRoutine(
  repo: RoutineRepository,
  id: RoutineId
): Promise<Result<RoutineId, RoutineUsecaseError>> {
  const target = await repo.findById(id);
  if (target === null) return err("routine_not_found");

  await repo.delete(id);
  return ok(id);
}
