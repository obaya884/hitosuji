// 打刻のユースケース（F-201 / データモデル定義書 §4.2）
import type { TaskRepository } from "@/application/ports/task-repository";
import { err, ok, type Result } from "@/domain/shared/result";
import { canFinish, canStart, resumeTaskDraft, type PunchError } from "@/domain/task/punch";
import { placeNewTask } from "@/domain/task/placement";
import type { TaskId } from "@/domain/task/task";

export type PunchUsecaseError = PunchError | "task_not_found";

/**
 * 開始打刻（F-201）。実行中タスクが他にあれば割り込みとして扱い、
 * ①実行中タスクを終了 ②その再開タスクを開始タスクの直下に生成 ③開始、を1トランザクションで行う。
 * 現在時刻はクライアントから受け取る（サーバ時刻を使わない）
 */
export async function startTask(
  repo: TaskRepository,
  input: Readonly<{ taskId: TaskId; now: Date }>
): Promise<Result<TaskId, PunchUsecaseError>> {
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");

  const startable = canStart(target);
  if (!startable.ok) return startable;

  const running = await repo.findRunning();
  if (running === null) {
    await repo.start({ taskId: target.id, startedAt: input.now, interruption: null });
    return ok(target.id);
  }

  const finishable = canFinish(running, input.now);
  if (!finishable.ok) return finishable;

  // 再開タスクは開始タスクの直下（＝開始タスクと同じ日付・セクション）に置く。
  // 前日以前の実行中タスクを割り込んだ場合も当日側に生成される（データモデル定義書 §4.2）
  const sameDay = await repo.listByDate(target.taskDate);
  const group = sameDay
    .filter((t) => t.sectionId === target.sectionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const placed = placeNewTask(group, target.sectionId, group.findIndex((t) => t.id === target.id) + 1);

  const draft = resumeTaskDraft(running, input.now);
  await repo.start({
    taskId: target.id,
    startedAt: input.now,
    interruption: {
      runningTaskId: running.id,
      endedAt: input.now, // 終了と開始に同じ時刻を使い、実績に隙間を作らない
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
    },
  });
  return ok(target.id);
}

/** 終了打刻（F-201） */
export async function finishTask(
  repo: TaskRepository,
  input: Readonly<{ taskId: TaskId; now: Date }>
): Promise<Result<TaskId, PunchUsecaseError>> {
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");

  const finishable = canFinish(target, input.now);
  if (!finishable.ok) return finishable;

  await repo.finish(target.id, input.now);
  return ok(target.id);
}

/**
 * 打刻時刻の修正（F-203）。
 * `HH:MM` → 絶対時刻の変換はクライアント側（利用者のタイムゾーン）で行い、
 * ここでは永続化前に 開始 ≦ 終了 の整合性を再検証する
 */
export async function updateTaskPunch(
  repo: TaskRepository,
  input: Readonly<{ taskId: TaskId; startedAt: Date; endedAt: Date | null }>
): Promise<Result<TaskId, PunchUsecaseError>> {
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");
  if (target.startedAt === null) return err("not_running");

  if (input.endedAt !== null && input.endedAt.getTime() < input.startedAt.getTime()) {
    return err("ended_before_started");
  }

  await repo.updatePunch(target.id, { startedAt: input.startedAt, endedAt: input.endedAt });
  return ok(target.id);
}
