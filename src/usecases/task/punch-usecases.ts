// 打刻のユースケース（F-201 / データモデル定義書 §4.2）と、その取り消し（F-210 同書 §4.5 / F-212 同書 §4.7）
import type { SectionRepository } from "@/usecases/ports/section-repository";
import type { Relocations, TaskRepository } from "@/usecases/ports/task-repository";
import type { SectionId } from "@/domain/section/section";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { err, ok, type Result } from "@/domain/shared/result";
import {
  canFinish,
  canStart,
  canUndoComplete,
  canUndoStart,
  resumeTaskDraft,
  type PunchError,
} from "@/domain/task/punch";
import { newTaskFromDraft } from "@/usecases/task/from-draft";
import { placeSortOrder, tasksInSection } from "@/domain/task/sort-order";
import { relocationOnPunchEdit, relocationOnStart, relocationOnUndoPunch } from "@/domain/task/relocation";
import type { Task, TaskId } from "@/domain/task/task";

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

  // 開始したタスク自身を、開始時刻を含むセクションへ移す（F-113 / 画面定義書01 §4.2-a）。
  // 対象は今日のタスクのみ。打刻の書き込みと同一トランザクションで反映する
  const sameDay = await repo.listByDate(target.taskDate);
  const startRelocation =
    target.taskDate === input.today
      ? relocationOnStart(target, sameDay, await deps.sections.listAll(), input.nowClock)
      : null;
  const relocations = startRelocation === null ? [] : [startRelocation];

  // 移動した場合、以降の配置計算（再開タスクの位置）は移動後の位置を基準にする
  const started =
    startRelocation === null
      ? target
      : { ...target, sectionId: startRelocation.sectionId, sortOrder: startRelocation.sortOrder };

  const running = await repo.findRunning();
  if (running === null) {
    await repo.start({
      taskId: target.id,
      startedAt: input.now,
      interruption: null,
      relocations,
    });
    return ok(target.id);
  }

  const finishable = canFinish(running, input.now);
  if (!finishable.ok) return finishable;

  // 再開タスクは開始タスクの直下（＝開始タスクと同じ日付・セクション）に置く。
  // 前日以前の実行中タスクを割り込んだ場合も当日側に生成される（データモデル定義書 §4.2）。
  // 画面定義書01 §4.2-a で開始タスクが移動した場合は移動先の直下になる
  const group = tasksInSection(
    sameDay.map((t) => (t.id === started.id ? started : t)),
    started.sectionId
  );
  // 再開タスクは新規なので自身は振り直しに含めない
  const placed = placeSortOrder(group, group.findIndex((t) => t.id === started.id) + 1);

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
    relocations,
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

  const relocations = await relocationsForUndoPunch(deps, target, input);

  await repo.undoStart(target.id, relocations);
  return ok(target.id);
}

/** 完了の取り消し（F-212 / データモデル定義書 §4.7）で保持する復帰用のスナップショット（書き換わる4列） */
export type CompletionSnapshot = Readonly<{
  taskId: TaskId;
  startedAt: Date;
  endedAt: Date;
  sectionId: SectionId | null;
  sortOrder: number;
}>;

/**
 * 完了の取り消し（F-212 / データモデル定義書 §4.7）。
 * 完了タスクの `started_at`・`ended_at` をともに null に戻して未実行にする。表示日が今日なら
 * 未実行として「現在位置」へ並べ直し、今日でなければ打刻のクリアだけ行う（F-210 と同じ規律）。
 * 中断・割り込みで生成された再開タスクや、割り込みで終了させた直前タスクには波及させない。
 * 実績を破棄する操作なので、復帰（下の `restoreCompletion`）に要る4列を呼び出し側へ返す。
 * 現在時刻はクライアントから受け取る（サーバ時刻を使わない）
 */
export async function undoComplete(
  deps: PunchDeps,
  input: Readonly<{ taskId: TaskId; nowClock: string; today: LogicalDate }>
): Promise<Result<CompletionSnapshot, PunchUsecaseError>> {
  const repo = deps.tasks;
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");

  const undoable = canUndoComplete(target);
  if (!undoable.ok) return undoable;
  const completed = undoable.value; // 打刻2列が絞り込まれた完了タスク

  const relocations = await relocationsForUndoPunch(deps, completed, input);

  await repo.undoComplete(completed.id, relocations);
  return ok({
    taskId: completed.id,
    startedAt: completed.startedAt,
    endedAt: completed.endedAt,
    sectionId: completed.sectionId,
    sortOrder: completed.sortOrder,
  });
}

/**
 * 完了の取り消しの取り消し（F-212 / データモデル定義書 §4.7）。
 * 取り消し前の打刻2列と配置2列を書き戻して完了状態へ復帰させる（1トランザクション）。
 * `sort_order` は復帰までの間に他タスクが同値を取っていてもそのまま書き戻す（同書 §4.7）
 */
export async function restoreCompletion(
  repo: TaskRepository,
  snapshot: CompletionSnapshot
): Promise<Result<TaskId, PunchUsecaseError>> {
  const target = await repo.findById(snapshot.taskId);
  if (target === null) return err("task_not_found");

  await repo.updatePunch(
    snapshot.taskId,
    { startedAt: snapshot.startedAt, endedAt: snapshot.endedAt },
    [{ taskId: snapshot.taskId, sectionId: snapshot.sectionId, sortOrder: snapshot.sortOrder }]
  );
  return ok(snapshot.taskId);
}

/**
 * 打刻の取り消し（開始 データモデル定義書 §4.5 / 完了 同書 §4.7）に伴う並べ直し。
 * 今日のタスクだけ未実行として並べ直す（今日以外は現在位置・これから領域が定義できない）
 */
async function relocationsForUndoPunch(
  deps: PunchDeps,
  target: Task,
  input: Readonly<{ nowClock: string; today: LogicalDate }>
): Promise<Relocations> {
  if (target.taskDate !== input.today) return [];

  return relocationOnUndoPunch(
    target,
    await deps.tasks.listByDate(target.taskDate),
    await deps.sections.listAll(),
    input.nowClock
  );
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
 * 開始時刻が変わった場合は、修正後の時刻を含むセクションへ移す（F-113 / 画面定義書01 §4.2-c）
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

  // 終了時刻だけの修正では移動しない（画面定義書01 §4.2 の対象外。帰属は「いつ始めたか」で決める）
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
    relocations
  );
  return ok(target.id);
}
