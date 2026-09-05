// 並び替えのユースケース（画面定義書01 O-6）
import type { TaskRepository } from "@/usecases/ports/task-repository";
import type { SectionRepository } from "@/usecases/ports/section-repository";
import type { SectionId } from "@/domain/section/section";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { ok, type Result } from "@/domain/shared/result";
import { displaySectionOrder } from "@/domain/task/daily-list";
import { moveTaskByStep, reorderTask, type ReorderError } from "@/domain/task/reorder";
import { tasksInSection } from "@/domain/task/sort-order";
import type { TaskId } from "@/domain/task/task";

export type ReorderUsecaseError = ReorderError;

/** Shift+J/K: 1つ上/下へ移動する。端ではセクションをまたぐ */
export async function moveTaskByOneStep(
  repos: Readonly<{ tasks: TaskRepository; sections: SectionRepository }>,
  input: Readonly<{ taskId: TaskId; date: LogicalDate; step: 1 | -1 }>
): Promise<Result<TaskId, ReorderUsecaseError>> {
  const [sameDay, sections] = await Promise.all([
    repos.tasks.listByDate(input.date),
    repos.sections.listAll(),
  ]);

  // 移動先は表示中のセクション順に一致させる（画面定義書01 O-6）。当日タスクが属する
  // アーカイブ済みセクションも表示されるため移動先に含む（presentation の楽観更新と同一規則）
  const sectionOrder = displaySectionOrder(sameDay, sections);

  const reorder = moveTaskByStep(sameDay, input.taskId, input.step, sectionOrder);
  if (!reorder.ok) return reorder;

  await repos.tasks.move(reorder.value);
  return ok(input.taskId);
}

/**
 * セクションの割り当て（O-5 / F-105）。
 * 移動先セクションの末尾へ置く（データモデル定義書 §3.5: セクション移動は移動先末尾 +1000）。
 * 任意位置への移動は提供しない（画面定義書01 O-6）
 */
export async function setTaskSection(
  repo: TaskRepository,
  input: Readonly<{ taskId: TaskId; date: LogicalDate; sectionId: SectionId | null }>
): Promise<Result<TaskId, ReorderUsecaseError>> {
  const sameDay = await repo.listByDate(input.date);

  const reorder = reorderTask(sameDay, input.taskId, {
    sectionId: input.sectionId,
    // 移動先の末尾へ。自分ごと数えた件数でも、範囲外の index は端へ丸められる
    index: tasksInSection(sameDay, input.sectionId).length,
  });
  if (!reorder.ok) return reorder;

  await repo.move(reorder.value);
  return ok(input.taskId);
}
