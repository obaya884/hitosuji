// 中断・複製・複製して開始・先送り・削除のユースケース（F-204 / F-111 / F-208 / F-107 / O-8）
import type { RoutineSkip, TaskRepository } from "@/usecases/ports/task-repository";
import type { SectionRepository } from "@/usecases/ports/section-repository";
import { addDays, type LogicalDate } from "@/domain/shared/logical-date";
import { err, ok, type Result } from "@/domain/shared/result";
import { sectionAt } from "@/domain/section/section";
import { duplicateDraft, insertionIndexForDuplicate } from "@/domain/task/duplicate";
import { canFinish, resumeTaskDraft } from "@/domain/task/punch";
import type { PunchUsecaseError } from "@/usecases/task/punch-usecases";
import { newTaskFromDraft } from "@/usecases/task/from-draft";
import { taskStatus } from "@/domain/task/status";
import { orderTasksForDisplay } from "@/domain/task/daily-list";
import {
  appendSortOrder,
  placeSortOrder,
  SORT_ORDER_STEP,
  tasksInSection,
} from "@/domain/task/sort-order";
import type { Task, TaskId } from "@/domain/task/task";

/**
 * 打刻ユースケースの失敗をそのまま含む（割り込み・中断が打刻の判断を通り、いずれの操作も
 * まずタスクを引くため）。`not_completed` は打刻ドメイン（`domain/task/punch.ts` の
 * `PunchError`）由来なので個別に足さない
 */
export type TaskOperationError = PunchUsecaseError | "not_postponable";

/**
 * 中断（F-204）。実行中タスクを現在時刻で終了し、
 * 残り見積もりの再開タスクを直後に生成する（割り込みと同じ生成規則）
 */
export async function suspendTask(
  repo: TaskRepository,
  input: Readonly<{ taskId: TaskId; now: Date }>
): Promise<Result<TaskId, TaskOperationError>> {
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");

  const finishable = canFinish(target, input.now);
  if (!finishable.ok) return finishable;

  // 再開タスクは元タスクの直後（データモデル定義書 §4.2-a）
  const sameDay = await repo.listByDate(target.taskDate);
  const group = tasksInSection(sameDay, target.sectionId);
  const index = group.findIndex((t) => t.id === target.id) + 1;
  const placed = placeSortOrder(group, index); // 新規タスクなので自身は振り直しに含めない

  const draft = resumeTaskDraft(target, input.now);
  await repo.suspend({
    taskId: target.id,
    endedAt: input.now,
    resumeTask: newTaskFromDraft(draft, {
      taskDate: target.taskDate,
      sectionId: target.sectionId,
      sortOrder: placed.sortOrder,
    }),
    renumber: placed.renumber,
  });
  return ok(target.id);
}

/**
 * 複製（F-111）。状態不問で複製し、未実行タスクとして「未実施のトップ」へ挿入する。
 * 挿入位置は1日のリスト全体の表示順で決まり、section_id は挿入位置のセクションに従う
 */
export async function duplicateTask(
  repos: Readonly<{ tasks: TaskRepository; sections: SectionRepository }>,
  input: Readonly<{ taskId: TaskId }>
): Promise<Result<Task, TaskOperationError>> {
  const target = await repos.tasks.findById(input.taskId);
  if (target === null) return err("task_not_found");

  const [sameDay, sections] = await Promise.all([
    repos.tasks.listByDate(target.taskDate),
    repos.sections.listAll(),
  ]);

  // 1日全体の表示順に対して「未実施のトップ」を求める
  const ordered = orderTasksForDisplay(sameDay, sections);
  const index = insertionIndexForDuplicate(ordered);

  // 挿入位置の直前のタスクからセクションを決める（先頭なら未分類）
  const sectionId = index === 0 ? null : ordered[index - 1].sectionId;
  const group = tasksInSection(sameDay, sectionId);
  const indexInGroup =
    index === 0 ? 0 : group.findIndex((t) => t.id === ordered[index - 1].id) + 1;
  const placed = placeSortOrder(group, indexInGroup); // 新規タスクなので自身は振り直しに含めない

  const draft = duplicateDraft(target);
  const created = await repos.tasks.create(
    newTaskFromDraft(draft, {
      taskDate: target.taskDate,
      sectionId,
      sortOrder: placed.sortOrder,
    }),
    placed.renumber
  );
  return ok(created);
}

/**
 * 複製して開始（F-208 / 画面定義書01 O-14 / データモデル定義書 §4.6）。
 * 完了タスクを複製し、その複製タスクをすぐ開始する「もう一回」。複製元は完了のまま残す。
 * 複製タスクは開始済みで作るため §4.2-a に従い現在時刻を含むセクションの末尾へ置く
 * （表示日が今日でないときは §4.2-a を適用せず複製元と同じセクションへ置く）。
 * 他に実行中タスクがあれば F-201 の割り込み（終了＋再開タスク生成）をそのまま伴う。
 * 現在時刻はクライアントから受け取る（サーバ時刻を使わない）
 */
export async function duplicateAndStartTask(
  repos: Readonly<{ tasks: TaskRepository; sections: SectionRepository }>,
  input: Readonly<{ taskId: TaskId; now: Date; nowClock: string; today: LogicalDate }>
): Promise<Result<Task, TaskOperationError>> {
  const target = await repos.tasks.findById(input.taskId);
  if (target === null) return err("task_not_found");
  // TaskOperationError を返す操作でこのコードを返すのはここだけ（打刻の完了取り消しも同じコードを
  // 返すが文言は別）。文言は taskActionErrorMessage("duplicateAndStart", …) が持つ（T-74 / T-76）
  if (taskStatus(target) !== "completed") return err("not_completed");

  const [sameDay, sections] = await Promise.all([
    repos.tasks.listByDate(target.taskDate),
    repos.sections.listAll(),
  ]);

  // 複製タスクは開始済みで作る → 開始時の自動セクション移動（§4.2-a）と同じ配置にする。
  // 現在時刻がどのセクションにも属さない・表示日が今日でないときは複製元のセクションへ置く
  const destinationSectionId =
    target.taskDate === input.today
      ? sectionAt(sections, input.nowClock)?.id ?? target.sectionId
      : target.sectionId;

  // セクション内の並びは常に tasksInSection で取り出す（末尾採番なので使うのは最大値だけ）
  const startedSortOrder = appendSortOrder(
    tasksInSection(sameDay, destinationSectionId).map((t) => t.sortOrder)
  );

  const draft = duplicateDraft(target);
  const newTask = newTaskFromDraft(draft, {
    taskDate: target.taskDate,
    sectionId: destinationSectionId,
    sortOrder: startedSortOrder,
  });

  const running = await repos.tasks.findRunning();
  if (running === null) {
    const created = await repos.tasks.duplicateAndStart({
      newTask,
      startedAt: input.now,
      interruption: null,
    });
    return ok(created);
  }

  const finishable = canFinish(running, input.now);
  if (!finishable.ok) return finishable;

  // 割り込み: 実行中タスクを終了し、その再開タスクを複製タスクの直下（同セクション末尾のさらに後ろ）へ置く
  const resume = resumeTaskDraft(running, input.now);
  const resumeTask = newTaskFromDraft(resume, {
    taskDate: target.taskDate,
    sectionId: destinationSectionId,
    sortOrder: startedSortOrder + SORT_ORDER_STEP,
  });

  const created = await repos.tasks.duplicateAndStart({
    newTask,
    startedAt: input.now,
    interruption: { runningTaskId: running.id, endedAt: input.now, resumeTask },
  });
  return ok(created);
}

/**
 * 先送り（F-107）。未実行タスクを翌日（または指定日）の同セクション末尾へ移し、
 * postponed_count を加算する。実行中・完了タスクには不可
 */
export async function postponeTask(
  repo: TaskRepository,
  input: Readonly<{ taskId: TaskId; to?: LogicalDate }>
): Promise<Result<TaskId, TaskOperationError>> {
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");
  if (taskStatus(target) !== "not_started") return err("not_postponable");

  const destination = input.to ?? addDays(target.taskDate, 1);
  const destinationTasks = await repo.listByDate(destination);
  const sortOrder = appendSortOrder(
    tasksInSection(destinationTasks, target.sectionId).map((t) => t.sortOrder)
  );

  await repo.postpone(target.id, { taskDate: destination, sortOrder });
  return ok(target.id);
}

/**
 * 削除（O-8）。Undo はクライアント側で「削除前のタスクを作り直す」形で実現する。
 * ルーチン由来のタスクは、その日を再展開しないようスキップも記録する（F-301）
 */
export async function deleteTask(
  repo: TaskRepository,
  input: Readonly<{ taskId: TaskId }>
): Promise<Result<Task, TaskOperationError>> {
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");

  await repo.delete(target.id, skipOf(target));
  return ok(target);
}

/** ルーチン由来のタスクなら、その日のスキップを表す（そうでなければ null） */
function skipOf(task: Task): RoutineSkip | null {
  return task.routineId === null
    ? null
    : { routineId: task.routineId, taskDate: task.taskDate };
}

/**
 * 削除の取り消し（O-8）。打刻・属性をそのままに復元する（id は採番し直される）。
 * ルーチン由来なら削除時に記録したスキップも解除する（F-301）
 */
export async function restoreTask(
  repo: TaskRepository,
  deleted: Task
): Promise<Result<Task, TaskOperationError>> {
  // id は復元先で採番し直されるので渡さない
  const { id, ...rest } = deleted;
  void id;
  return ok(await repo.restore(rest, skipOf(deleted)));
}
