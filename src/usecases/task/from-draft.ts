// draft（複製・再開）から永続化入力 NewTask を組み立てる共通ヘルパー（T-18）
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { TaskId } from "@/domain/task/task";
import type { NewTask } from "@/usecases/ports/task-repository";

/**
 * draft（複製・再開）が共通で持つ内容フィールド。配置は別途決める。
 * `splitParentId`・`highlighted` は再開 draft のみが持ち、複製 draft は持たない
 * （前者は系譜属性、後者は「同じ仕事の続きにだけ引き継ぐ」印。F-118 / データモデル定義書 §4.2・§4.6）
 */
type TaskContentDraft = Readonly<{
  name: string;
  estimateMinutes: number;
  modeId: number | null;
  projectId: number | null;
  highlighted?: boolean;
  splitParentId?: TaskId | null;
}>;

/**
 * draft の内容フィールドに配置（日付・セクション・並び順）を与えて NewTask を組み立てる（T-18）。
 * `splitParentId`・`highlighted` は draft から拾う（再開 draft は元タスクの値、複製 draft は
 * 持たないため null / false になる）
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
    highlighted: draft.highlighted ?? false,
    splitParentId: draft.splitParentId ?? null,
  };
}
