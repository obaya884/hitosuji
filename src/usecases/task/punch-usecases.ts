// 打刻のユースケース（F-201 / データモデル定義書 §4.2）
import type { SectionRepository } from "@/usecases/ports/section-repository";
import type { TaskRepository } from "@/usecases/ports/task-repository";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { err, ok, type Result } from "@/domain/shared/result";
import { canFinish, canStart, canUndoStart, resumeTaskDraft, type PunchError } from "@/domain/task/punch";
import { newTaskFromDraft } from "@/usecases/task/from-draft";
import { placeNewTask } from "@/domain/task/placement";
import { relocationOnPunchEdit, relocationOnStart, relocationOnUndoStart } from "@/domain/task/relocation";
import type { TaskId } from "@/domain/task/task";

export type PunchUsecaseError = PunchError | "task_not_found";

/** 開始打刻は自動セクション移動（F-113）のためにセクションも要る */
export type PunchDeps = Readonly<{
  tasks: TaskRepository;
  sections: SectionRepository;
}>;

/**
 * 開始打刻（F-201）。実行中タスクが他にあれば割り込みとして扱い、
 * ①実行中タスクを終了 ②その再開タスクを開始タスクの直下に生成 ③開始、を1トランザクションで行う。
 * 現在時刻はクライアントから受け取る（サーバ時刻を使わない）
 */
export async function startTask(
  deps: PunchDeps,
  input: Readonly<{ taskId: TaskId; now: Date; nowClock: string; today: LogicalDate }>
): Promise<Result<TaskId, PunchUsecaseError>> {
  const repo = deps.tasks;
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");

  const startable = canStart(target);
  if (!startable.ok) return startable;

  // 開始したタスク自身を、開始時刻を含むセクションへ移す（F-113 §4.2-a）。
  // 対象は今日のタスクのみ。打刻の書き込みと同一トランザクションで反映する
  const sameDay = await repo.listByDate(target.taskDate);
  const relocation =
    target.taskDate === input.today
      ? relocationOnStart(target, sameDay, await deps.sections.listAll(), input.nowClock)
      : null;
  const relocations = relocation === null ? null : [relocation];

  // 移動した場合、以降の配置計算（再開タスクの位置）は移動後の位置を基準にする
  const started =
    relocation === null
      ? target
      : { ...target, sectionId: relocation.sectionId, sortOrder: relocation.sortOrder };

  const running = await repo.findRunning();
  if (running === null) {
    await repo.start({
      taskId: target.id,
      startedAt: input.now,
      interruption: null,
      relocation: relocations,
    });
    return ok(target.id);
  }

  const finishable = canFinish(running, input.now);
  if (!finishable.ok) return finishable;

  // 再開タスクは開始タスクの直下（＝開始タスクと同じ日付・セクション）に置く。
  // 前日以前の実行中タスクを割り込んだ場合も当日側に生成される（データモデル定義書 §4.2）。
  // §4.2-a で開始タスクが移動した場合は移動先の直下になる
  const group = sameDay
    .map((t) => (t.id === started.id ? started : t))
    .filter((t) => t.sectionId === started.sectionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
  const placed = placeNewTask(group, started.sectionId, group.findIndex((t) => t.id === started.id) + 1);

  const draft = resumeTaskDraft(running, input.now);
  await repo.start({
    taskId: target.id,
    startedAt: input.now,
    interruption: {
      runningTaskId: running.id,
      endedAt: input.now, // 終了と開始に同じ時刻を使い、実績に隙間を作らない
      resumeTask: newTaskFromDraft(draft, {
        taskDate: target.taskDate,
        sectionId: started.sectionId,
        sortOrder: placed.sortOrder,
      }),
      renumber: placed.renumber,
    },
    relocation: relocations,
  });
  return ok(target.id);
}

/**
 * 開始打刻の取り消し（F-210 / データモデル定義書 §4.5）。
 * 実行中タスクの `started_at` を null に戻す。表示日が今日なら未実行として「現在位置」
 * （現在時刻を含むセクションの未実行先頭）へ並べ直し、今日でなければ打刻のクリアだけ行う。
 * 割り込みで開始していた場合も波及させず、当該タスクだけを未実行に戻す（局所操作）。
 * 現在時刻はクライアントから受け取る（サーバ時刻を使わない）
 */
export async function undoStart(
  deps: PunchDeps,
  input: Readonly<{ taskId: TaskId; nowClock: string; today: LogicalDate }>
): Promise<Result<TaskId, PunchUsecaseError>> {
  const repo = deps.tasks;
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");

  const undoable = canUndoStart(target);
  if (!undoable.ok) return undoable;

  // 今日のタスクだけ未実行として並べ直す（今日以外は現在位置・これから領域が定義できない）
  const relocations =
    target.taskDate === input.today
      ? relocationOnUndoStart(
          target,
          await repo.listByDate(target.taskDate),
          await deps.sections.listAll(),
          input.nowClock
        )
      : [];

  await repo.undoStart(target.id, relocations.length === 0 ? null : relocations);
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
 * ここでは永続化前に 開始 ≦ 終了 の整合性を再検証する。
 * 開始時刻が変わった場合は、修正後の時刻を含むセクションへ移す（F-113 §4.2-c）
 */
export async function updateTaskPunch(
  deps: PunchDeps,
  input: Readonly<{
    taskId: TaskId;
    startedAt: Date;
    endedAt: Date | null;
    /** 修正後の開始時刻の `HH:MM`（クライアントのタイムゾーンで整形したもの） */
    startClock: string;
    today: LogicalDate;
  }>
): Promise<Result<TaskId, PunchUsecaseError>> {
  const repo = deps.tasks;
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");
  if (target.startedAt === null) return err("not_running");

  if (input.endedAt !== null && input.endedAt.getTime() < input.startedAt.getTime()) {
    return err("ended_before_started");
  }

  // 終了時刻だけの修正では移動しない（§4.2 の対象外。帰属は「いつ始めたか」で決める）
  const startedAtChanged = target.startedAt.getTime() !== input.startedAt.getTime();
  const relocations =
    startedAtChanged && target.taskDate === input.today
      ? relocationOnPunchEdit(
          target,
          await repo.listByDate(target.taskDate),
          await deps.sections.listAll(),
          input.startedAt,
          input.startClock
        )
      : [];

  await repo.updatePunch(
    target.id,
    { startedAt: input.startedAt, endedAt: input.endedAt },
    relocations.length === 0 ? null : relocations
  );
  return ok(target.id);
}
