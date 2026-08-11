// 打刻と割り込み・中断の生成規則（要件定義書 §5.2 F-201/F-204 / データモデル定義書 §4.2）
import type { BundleId } from "../bundle/bundle";
import type { ModeId } from "../mode/mode";
import type { ProjectId } from "../project/project";
import { err, ok, type Result } from "../shared/result";
import { taskStatus } from "./status";
import { actualMinutes, type Task, type TaskId } from "./task";

export type PunchError =
  | "already_started"
  | "not_running"
  | "not_completed"
  | "ended_before_started";

/**
 * 再開タスクの名前に付ける接尾辞（データモデル定義書 §4.2）。
 * リスト・レビューで元と再開分を見分けるために**保存値へ含める**（表示で導出しない）。
 * 既に付いていても足すので、中断を重ねると `〜（再開）（再開）` と積み上がる
 */
const RESUME_NAME_SUFFIX = "（再開）";

/**
 * 再開タスクの見積もり（データモデル定義書 §4.2）。
 * 元が未設定（0分）なら未設定のまま引き継ぐ。設定済みなら max(見積 − 実績, 1分)
 */
function resumeEstimateMinutes(original: Task, actual: number): number {
  if (original.estimateMinutes <= 0) return 0;
  return Math.max(original.estimateMinutes - actual, 1);
}

/** 再開タスクの内容。配置（日付・セクション・並び順）は呼び出し側が決める */
export type ResumeTaskDraft = Readonly<{
  name: string;
  estimateMinutes: number;
  modeId: ModeId | null;
  projectId: ProjectId | null;
  highlighted: boolean;
  splitParentId: TaskId;
  bundleId: BundleId | null;
}>;

/**
 * 中断・割り込みで生成する再開タスクの内容を作る。
 * mode/project/highlighted/bundle_id は元タスクと同値、split_parent_id で元タスクへ紐づける
 * （F-204 / データモデル定義書 §4.2。ハイライトを引き継ぐ規則は F-118）。
 * bundle_id を引き継ぐのは、外すと中断・割り込みで分かれたぶんがバンドルから抜けて
 * バンドルが永遠に完了しなくなるため（集合モデルなのでメンバーが1つ増えるだけで済む。§4.8）
 */
export function resumeTaskDraft(original: Task, endedAt: Date): ResumeTaskDraft {
  const actual = actualMinutes({ ...original, endedAt }) ?? 0;
  return {
    name: `${original.name}${RESUME_NAME_SUFFIX}`,
    estimateMinutes: resumeEstimateMinutes(original, actual),
    modeId: original.modeId,
    projectId: original.projectId,
    highlighted: original.highlighted,
    splitParentId: original.id,
    bundleId: original.bundleId,
  };
}

/** 開始できるのは未実行タスクのみ（F-201） */
export function canStart(task: Task): Result<Task, PunchError> {
  return taskStatus(task) === "not_started" ? ok(task) : err("already_started");
}

/** 開始打刻を取り消せるのは実行中タスクのみ（F-210）。完了・未実行は対象外 */
export function canUndoStart(task: Task): Result<Task, PunchError> {
  return taskStatus(task) === "running" ? ok(task) : err("not_running");
}

/** 打刻2列がそろったタスク（完了。終了があれば開始も必ずある——`ck_tasks_time`） */
export type CompletedTask = Task & Readonly<{ startedAt: Date; endedAt: Date }>;

/**
 * 完了を取り消せるのは完了タスクのみ（F-212）。未実行・実行中は対象外。
 * 復帰用のスナップショット（データモデル定義書 §4.7）を組めるよう打刻2列を絞り込んで返す
 */
export function canUndoComplete(task: Task): Result<CompletedTask, PunchError> {
  if (taskStatus(task) !== "completed" || task.startedAt === null || task.endedAt === null) {
    return err("not_completed");
  }
  return ok({ ...task, startedAt: task.startedAt, endedAt: task.endedAt });
}

/** 終了・中断できるのは実行中タスクのみ（F-201/F-204） */
export function canFinish(task: Task, now: Date): Result<Task, PunchError> {
  if (taskStatus(task) !== "running") return err("not_running");
  // ck_tasks_time と同じ整合性をドメインでも守る（開始 ≦ 終了。F-203）
  if (task.startedAt !== null && now.getTime() < task.startedAt.getTime()) {
    return err("ended_before_started");
  }
  return ok(task);
}
