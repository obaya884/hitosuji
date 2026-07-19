// 中断・複製・先送り・削除のユースケース（F-204 / F-111 / F-107 / O-8）
import type { SectionRepository } from "@/application/ports/section-repository";
import type { TaskRepository } from "@/application/ports/task-repository";
import { addDays, type LogicalDate } from "@/domain/shared/logical-date";
import { err, ok, type Result } from "@/domain/shared/result";
import { duplicateDraft, insertionIndexForDuplicate } from "@/domain/task/duplicate";
import { canFinish, resumeTaskDraft, type PunchError } from "@/domain/task/punch";
import { taskStatus } from "@/domain/task/status";
import { orderTasksForDisplay } from "@/domain/task/daily-list";
import { placeNewTask } from "@/domain/task/placement";
import { appendSortOrder } from "@/domain/task/sort-order";
import type { Task, TaskId } from "@/domain/task/task";

export type TaskOperationError = PunchError | "task_not_found" | "not_postponable";

function sortedInSection(tasks: readonly Task[], sectionId: number | null): Task[] {
  return tasks
    .filter((t) => t.sectionId === sectionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

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
  const group = sortedInSection(sameDay, target.sectionId);
  const index = group.findIndex((t) => t.id === target.id) + 1;
  const placed = placeNewTask(group, target.sectionId, index);

  const draft = resumeTaskDraft(target, input.now);
  await repo.suspend({
    taskId: target.id,
    endedAt: input.now,
    resumeTask: {
      taskDate: target.taskDate,
      name: draft.name,
      estimateMinutes: draft.estimateMinutes,
      sectionId: target.sectionId,
      modeId: draft.modeId,
      projectId: draft.projectId,
      sortOrder: placed.sortOrder,
      splitParentId: draft.splitParentId,
    },
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
  const group = sortedInSection(sameDay, sectionId);
  const indexInGroup =
    index === 0 ? 0 : group.findIndex((t) => t.id === ordered[index - 1].id) + 1;
  const placed = placeNewTask(group, sectionId, indexInGroup);

  const draft = duplicateDraft(target);
  const created = await repos.tasks.create(
    {
      taskDate: target.taskDate,
      name: draft.name,
      estimateMinutes: draft.estimateMinutes,
      sectionId: placed.sectionId, // 挿入位置のセクションに従う（F-111）
      modeId: draft.modeId,
      projectId: draft.projectId,
      sortOrder: placed.sortOrder,
      splitParentId: null,
    },
    placed.renumber
  );
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
    sortedInSection(destinationTasks, target.sectionId).map((t) => t.sortOrder)
  );

  await repo.postpone(target.id, { taskDate: destination, sortOrder });
  return ok(target.id);
}

/** 削除（O-8）。Undo はクライアント側で「削除前のタスクを作り直す」形で実現する */
export async function deleteTask(
  repo: TaskRepository,
  input: Readonly<{ taskId: TaskId }>
): Promise<Result<Task, TaskOperationError>> {
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");

  await repo.delete(target.id);
  return ok(target);
}

/** 削除の取り消し（O-8）。打刻・属性をそのままに復元する（id は採番し直される） */
export async function restoreTask(
  repo: TaskRepository,
  deleted: Task
): Promise<Result<Task, TaskOperationError>> {
  // id は復元先で採番し直されるので渡さない
  const { id, ...rest } = deleted;
  void id;
  return ok(await repo.restore(rest));
}
