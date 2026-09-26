// ルーチン管理のユースケース（S-02 / 画面定義書02 §5、S-05 / 画面定義書05）
import type { BundleId } from "@/domain/bundle/bundle";
import type { RoutineRepository } from "@/usecases/ports/routine-repository";
import type { TaskRepository } from "@/usecases/ports/task-repository";
import type { Routine, RoutineError, RoutineId } from "@/domain/routine/routine";
import {
  routineInputFromTask,
  type RoutineFromTaskChoice,
  type RoutineFromTaskError,
} from "@/domain/routine/from-task";
import { validateRoutineInput, type RoutineInput } from "@/domain/routine/input";
import { routineTaskContent } from "@/domain/routine/task-content";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { compareByName } from "@/domain/shared/name-order";
import { err, ok, type Result } from "@/domain/shared/result";
import { appendSortOrder } from "@/domain/task/sort-order";
import type { Task, TaskId } from "@/domain/task/task";
import { newTaskFromDraft } from "@/usecases/task/from-draft";

export type RoutineUsecaseError = RoutineError | "routine_not_found";

/**
 * ルーチン化の失敗（F-305）。`createRoutine` の失敗（`RoutineUsecaseError`）は含まない——
 * `routineInputFromTask` が検証済みの入力を作るので、リポジトリへ直接渡せる
 */
export type CreateRoutineFromTaskError = RoutineFromTaskError | "task_not_found";

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

  return ok(await deps.routines.create(input.value));
}

/**
 * 今日へコピー（F-307 / 画面定義書02 O-6）。
 * ルーチンの内容を写した未実行タスクを1件作る。**展開（データモデル定義書 §4.1）とは独立した経路**で、
 * `routine_id` を持たせず（`NewTask` が持たないので構造的に NULL）、スキップ記録
 * （`routine_skips`）も読まない。**無効化中・周期の対象外・スキップ済みの日でも作れる**のは、
 * そのどの判定にも触れていないことの帰結（要件定義書 §5.3）。
 * 置き場は**開始想定時刻を使わず未分類の末尾**（臨時の1件を時間帯の枠に入れない。画面定義書02 O-6）
 */
export async function copyRoutineToDate(
  deps: Readonly<{ routines: RoutineRepository; tasks: TaskRepository }>,
  id: RoutineId,
  date: LogicalDate
): Promise<Result<Task, RoutineUsecaseError>> {
  const target = await deps.routines.findById(id);
  if (target === null) return err("routine_not_found");

  const sameDay = await deps.tasks.listByDate(date);
  const unclassified = sameDay.filter((t) => t.sectionId === null).map((t) => t.sortOrder);

  const created = await deps.tasks.create(
    newTaskFromDraft(routineTaskContent(target), {
      taskDate: date,
      sectionId: null,
      sortOrder: appendSortOrder(unclassified),
    }),
    [] // 末尾追加なので振り直しは伴わない
  );
  return ok(created);
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

export type AddRoutineToBundleError = "not_found" | "already_in_bundle";

/**
 * メンバーの追加（画面定義書05 O-5）。展開済みタスクには波及しない（データモデル定義書 §4.8）。
 * **すでにどこかのバンドルに入っている相手は受け付けない**——S-05 の候補は未所属だけに絞るが、
 * 別タブでの操作で状況が変わっていることがあるのでサーバ側でも見る（画面定義書05 §6）。
 * 付け替えは S-02 の編集フォーム（`updateRoutine`）が担う
 */
export async function addRoutineToBundle(
  repo: RoutineRepository,
  routineId: RoutineId,
  bundleId: BundleId
): Promise<Result<RoutineId, AddRoutineToBundleError>> {
  const routine = await repo.findById(routineId);
  if (routine === null) return err("not_found");
  if (routine.bundleId !== null) return err("already_in_bundle");

  await repo.setBundle(routineId, bundleId);
  return ok(routineId);
}

export type RemoveRoutineFromBundleError = "not_found";

/** メンバーを外す（画面定義書05 O-6）。すでに未所属でも結果は同じなので成功として返す */
export async function removeRoutineFromBundle(
  repo: RoutineRepository,
  routineId: RoutineId
): Promise<Result<RoutineId, RemoveRoutineFromBundleError>> {
  if ((await repo.findById(routineId)) === null) return err("not_found");
  await repo.setBundle(routineId, null);
  return ok(routineId);
}
