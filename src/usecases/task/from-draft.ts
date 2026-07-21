// draft（複製・再開）から永続化入力 NewTask を組み立てる共通ヘルパー（T-18）
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { TaskId } from "@/domain/task/task";
import type { NewTask } from "@/usecases/ports/task-repository";

/**
 * draft（複製・再開）が共通で持つ内容フィールド。配置は別途決める。
 * `splitParentId` は再開 draft のみが持つ系譜属性で、複製 draft は持たない（＝null 扱い）
 */
type TaskContentDraft = Readonly<{
  name: string;
  estimateMinutes: number;
  modeId: number | null;
  projectId: number | null;
  splitParentId?: TaskId | null;
}>;

/**
 * draft の内容フィールドに配置（日付・セクション・並び順）を与えて NewTask を組み立てる（T-18）。
 * `splitParentId` は draft から拾う（再開 draft は元タスクID、複製 draft は持たないため null）
 */
export function newTaskFromDraft(
  draft: TaskContentDraft,
  placement: Readonly<{
    taskDate: LogicalDate;
    sectionId: number | null;
    sortOrder: number;
  }>
): NewTask {
  return {
    taskDate: placement.taskDate,
    name: draft.name,
    estimateMinutes: draft.estimateMinutes,
    sectionId: placement.sectionId,
    modeId: draft.modeId,
    projectId: draft.projectId,
    sortOrder: placement.sortOrder,
    splitParentId: draft.splitParentId ?? null,
  };
}
