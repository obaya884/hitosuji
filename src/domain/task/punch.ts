// 打刻と割り込み・中断の生成規則（要件定義書 §5.2 F-201/F-204 / データモデル定義書 §4.2）
import { err, ok, type Result } from "../shared/result";
import { taskStatus } from "./status";
import { actualMinutes, type Task, type TaskId } from "./task";

export type PunchError = "already_started" | "not_running" | "ended_before_started";

/**
 * 再開タスクの見積もり（データモデル定義書 §4.2）。
 * 元が未設定（0分）なら未設定のまま引き継ぐ。設定済みなら max(見積 − 実績, 1分)
 */
export function resumeEstimateMinutes(original: Task, actual: number): number {
  if (original.estimateMinutes <= 0) return 0;
  return Math.max(original.estimateMinutes - actual, 1);
}

/** 再開タスクの内容。配置（日付・セクション・並び順）は呼び出し側が決める */
export type ResumeTaskDraft = Readonly<{
  name: string;
  estimateMinutes: number;
  modeId: number | null;
  projectId: number | null;
  splitParentId: TaskId;
}>;

/**
 * 中断・割り込みで生成する再開タスクの内容を作る。
 * name/mode/project は元タスクと同値、split_parent_id で元タスクへ紐づける（F-204）
 */
export function resumeTaskDraft(original: Task, endedAt: Date): ResumeTaskDraft {
  const actual = actualMinutes({ ...original, endedAt }) ?? 0;
  return {
    name: original.name,
    estimateMinutes: resumeEstimateMinutes(original, actual),
    modeId: original.modeId,
    projectId: original.projectId,
    splitParentId: original.id,
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

/** 終了・中断できるのは実行中タスクのみ（F-201/F-204） */
export function canFinish(task: Task, now: Date): Result<Task, PunchError> {
  if (taskStatus(task) !== "running") return err("not_running");
  // ck_tasks_time と同じ整合性をドメインでも守る（開始 ≦ 終了。F-203）
  if (task.startedAt !== null && now.getTime() < task.startedAt.getTime()) {
    return err("ended_before_started");
  }
  return ok(task);
}
