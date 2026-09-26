// draft（複製・再開・ルーチンのコピー）から永続化入力 NewTask を組み立てる共通ヘルパー（T-18）
import type { BundleId } from "@/domain/bundle/bundle";
import type { ModeId } from "@/domain/mode/mode";
import type { ProjectId } from "@/domain/project/project";
import type { SectionId } from "@/domain/section/section";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { TaskId } from "@/domain/task/task";
import type { NewTask } from "@/usecases/ports/task-repository";

/**
 * draft が共通で持つ内容フィールド。配置は別途決める。
 * 任意の3つ（`splitParentId`・`highlighted`・`bundleId`）は**持つ draft が違う**——
 * `splitParentId` は系譜属性、`highlighted` は「同じ仕事の続きにだけ引き継ぐ」印（F-118）で
 * どちらも再開 draft だけが持ち、`bundleId` は**中断・割り込みの残り（§4.2）と
 * ルーチンのコピー（F-307。ルーチンの所属をそのまま写す＝展開 §4.1 と同じ）**が持つ。
 * 複製 draft（F-111）は3つとも持たない
 *（データモデル定義書 §4.1・§4.2・§4.6・§4.8）
 */
type TaskContentDraft = Readonly<{
  name: string;
  estimateMinutes: number;
  modeId: ModeId | null;
  projectId: ProjectId | null;
  highlighted?: boolean;
  splitParentId?: TaskId | null;
  bundleId?: BundleId | null;
  /** 参照先 URL（F-125）。どの draft も写す（複製・再開は元タスクの値、コピーはルーチンの値） */
  url: string | null;
}>;

/**
 * draft の内容フィールドに配置（日付・セクション・並び順）を与えて NewTask を組み立てる（T-18）。
 * `splitParentId`・`highlighted`・`bundleId` は draft から拾う（持たない draft では
 * null / false になる。どの draft が持つかは上の TaskContentDraft のコメント）
 */
export function newTaskFromDraft(
  draft: TaskContentDraft,
  placement: Readonly<{
    taskDate: LogicalDate;
    sectionId: SectionId | null;
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
    bundleId: draft.bundleId ?? null,
    url: draft.url,
  };
}
