"use server";

import { revalidatePath } from "next/cache";
import {
  addTask,
  renameTask,
  setTaskMode,
  setTaskProject,
  updateTaskComment,
  updateTaskEstimate,
} from "@/usecases/task/daily-list-usecases";
import {
  finishTask,
  restoreCompletion,
  startTask,
  undoComplete,
  undoStart,
  updateTaskPunch,
  type CompletionSnapshot,
} from "@/usecases/task/punch-usecases";
import {
  deleteTask,
  duplicateAndStartTask,
  duplicateTask,
  postponeTask,
  restoreTask,
  suspendTask,
} from "@/usecases/task/operations";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task } from "@/domain/task/task";
import { moveTaskByOneStep, setTaskSection } from "@/usecases/task/reorder-usecases";
import { createRoutineFromTask } from "@/usecases/routine/routine-usecases";
import { applyCarryOverAfterPunch } from "@/usecases/task/relocation-usecases";
import type { ActionResult } from "@/app/_lib/action-result";
import { formatClock } from "@/app/_lib/format";
import { resolveToday } from "@/usecases/section/resolve-today";
import {
  DUPLICATE_AND_START_MESSAGES,
  OPERATION_MESSAGES,
  PUNCH_MESSAGES,
  REORDER_MESSAGES,
  routineFromTaskErrorMessage,
  TASK_EDIT_MESSAGES,
} from "@/app/_lib/error-messages";
import type { RoutineFromTaskChoice } from "@/domain/routine/from-task";
import { createRoutineRepository } from "@/infrastructure/db/repositories/drizzle-routine-repository";
import { createSectionRepository } from "@/infrastructure/db/repositories/drizzle-section-repository";
import { createTaskRepository } from "@/infrastructure/db/repositories/drizzle-task-repository";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
const taskRepo = createTaskRepository();
const sectionRepo = createSectionRepository();
const routineRepo = createRoutineRepository();
/** 打刻と自動セクション移動（F-113）はセクションも参照する */
const punchDeps = { tasks: taskRepo, sections: sectionRepo };

export type DailyActionResult = ActionResult;

/** 生成系アクション（追加・複製・複製して開始）の結果。成功時に採番された生成物 id を返す */
export type CreatingActionResult = Readonly<
  { ok: true; createdId: number } | { ok: false; message: string }
>;

export async function addTaskAction(
  input: Readonly<{ date: LogicalDate; name: string }>
): Promise<CreatingActionResult> {
  const result = await addTask(taskRepo, input);
  if (!result.ok) return { ok: false, message: TASK_EDIT_MESSAGES[result.error] };
  revalidatePath("/");
  // 追加したタスクを選択するため採番結果を返す（画面定義書01 §3.4 / FB-29）
  return { ok: true, createdId: result.value.id };
}

export async function renameTaskAction(
  id: number,
  name: string
): Promise<DailyActionResult> {
  const result = await renameTask(taskRepo, id, name);
  if (!result.ok) return { ok: false, message: TASK_EDIT_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

export async function updateTaskEstimateAction(
  id: number,
  rawMinutes: string
): Promise<DailyActionResult> {
  const result = await updateTaskEstimate(taskRepo, id, rawMinutes);
  if (!result.ok) return { ok: false, message: TASK_EDIT_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

/** コメントの編集（F-206 / O-16） */
export async function updateTaskCommentAction(
  id: number,
  rawComment: string
): Promise<DailyActionResult> {
  const result = await updateTaskComment(taskRepo, id, rawComment);
  if (!result.ok) return { ok: false, message: TASK_EDIT_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

/** 開始打刻（F-201）。now はクライアントの現在時刻を受け取る */
export async function startTaskAction(id: number, now: Date): Promise<DailyActionResult> {
  // 「今日」は日界（F-116）を踏まえて解決する（サーバ側で日界セクションを読む）
  const today = await resolveToday(sectionRepo, now);
  const nowClock = formatClock(now);
  const result = await startTask(punchDeps, { taskId: id, now, nowClock, today });
  if (!result.ok) return { ok: false, message: PUNCH_MESSAGES[result.error] };
  // 開始したタスクより前に残っている未実行タスクを繰り下げる（F-113 §4.2-b）
  await applyCarryOverAfterPunch(punchDeps, { date: today, today, nowClock });
  revalidatePath("/");
  return { ok: true };
}

/** 開始打刻の取り消し（F-210 / O-13）。now はクライアントの現在時刻を受け取る */
export async function undoStartAction(id: number, now: Date): Promise<DailyActionResult> {
  const result = await undoStart(punchDeps, {
    taskId: id,
    nowClock: formatClock(now),
    today: await resolveToday(sectionRepo, now),
  });
  if (!result.ok) return { ok: false, message: PUNCH_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

/**
 * 完了の取り消し（F-212 / O-15）。実績を破棄するので、Undo（復帰）に要る4列のスナップショットを返す。
 * now はクライアントの現在時刻を受け取る
 */
export async function undoCompleteAction(
  id: number,
  now: Date
): Promise<
  Readonly<{ ok: true; snapshot: CompletionSnapshot } | { ok: false; message: string }>
> {
  const result = await undoComplete(punchDeps, {
    taskId: id,
    nowClock: formatClock(now),
    today: await resolveToday(sectionRepo, now),
  });
  if (!result.ok) return { ok: false, message: PUNCH_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true, snapshot: result.value };
}

/** 完了の取り消しの取り消し（F-212 / O-15）。スナップショットの4列を書き戻して完了へ復帰させる */
export async function restoreCompletionAction(
  snapshot: CompletionSnapshot
): Promise<DailyActionResult> {
  const result = await restoreCompletion(taskRepo, snapshot);
  if (!result.ok) return { ok: false, message: PUNCH_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

export async function finishTaskAction(id: number, now: Date): Promise<DailyActionResult> {
  const result = await finishTask(taskRepo, { taskId: id, now });
  if (!result.ok) return { ok: false, message: PUNCH_MESSAGES[result.error] };
  const today = await resolveToday(sectionRepo, now);
  await applyCarryOverAfterPunch(punchDeps, { date: today, today, nowClock: formatClock(now) });
  revalidatePath("/");
  return { ok: true };
}

/**
 * 打刻時刻の修正（F-203）。HH:MM の解釈はクライアント側で済ませ、絶対時刻を受け取る。
 * 開始時刻の修正時はセクション移動（F-113 §4.2-c）も同一トランザクションで行うため、
 * 移動先の判定に使う `HH:MM` もクライアントのタイムゾーンで整形して受け取る
 */
export async function updateTaskPunchAction(
  id: number,
  punch: Readonly<{ startedAt: Date; endedAt: Date | null }>,
  startClock: string,
  now: Date
): Promise<DailyActionResult> {
  const result = await updateTaskPunch(punchDeps, {
    taskId: id,
    ...punch,
    startClock,
    // 「今日」の判定は他の打刻アクションと同じくクライアントの現在時刻＋日界（F-116）から導く
    today: await resolveToday(sectionRepo, now),
  });
  if (!result.ok) return { ok: false, message: PUNCH_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

/** Shift+J/K での並び替え（O-6） */
export async function moveTaskByStepAction(
  input: Readonly<{ taskId: number; date: LogicalDate; step: 1 | -1 }>
): Promise<DailyActionResult> {
  const result = await moveTaskByOneStep(
    { tasks: taskRepo, sections: sectionRepo },
    input
  );
  if (!result.ok) return { ok: false, message: REORDER_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

/** モード・プロジェクト・セクションの割り当て（O-5） */
export async function setTaskModeAction(
  id: number,
  modeId: number | null
): Promise<DailyActionResult> {
  const result = await setTaskMode(taskRepo, id, modeId);
  if (!result.ok) return { ok: false, message: TASK_EDIT_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

export async function setTaskProjectAction(
  id: number,
  projectId: number | null
): Promise<DailyActionResult> {
  const result = await setTaskProject(taskRepo, id, projectId);
  if (!result.ok) return { ok: false, message: TASK_EDIT_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

export async function setTaskSectionAction(
  input: Readonly<{ taskId: number; date: LogicalDate; sectionId: number | null }>
): Promise<DailyActionResult> {
  const result = await setTaskSection(taskRepo, input);
  if (!result.ok) return { ok: false, message: REORDER_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

/** 中断（F-204） */
export async function suspendTaskAction(id: number, now: Date): Promise<DailyActionResult> {
  const result = await suspendTask(taskRepo, { taskId: id, now });
  if (!result.ok) return { ok: false, message: OPERATION_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

/** 複製（F-111）。複製後に選択行を移すため、作られたタスクのIDを返す（O-11） */
export async function duplicateTaskAction(id: number): Promise<CreatingActionResult> {
  const result = await duplicateTask({ tasks: taskRepo, sections: sectionRepo }, { taskId: id });
  if (!result.ok) return { ok: false, message: OPERATION_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true, createdId: result.value.id };
}

/**
 * 複製して開始（F-208 / O-14）。完了タスクの「もう一回」。生成物の採番はサーバが決めるため
 * 楽観的更新はしない。開始した複製タスクへ選択を移すため作られたIDを返す。now はクライアントの現在時刻
 */
export async function duplicateAndStartTaskAction(
  id: number,
  now: Date
): Promise<CreatingActionResult> {
  const today = await resolveToday(sectionRepo, now);
  const nowClock = formatClock(now);
  const result = await duplicateAndStartTask(
    { tasks: taskRepo, sections: sectionRepo },
    { taskId: id, now, nowClock, today }
  );
  if (!result.ok) return { ok: false, message: DUPLICATE_AND_START_MESSAGES[result.error] };
  // 開始により前に残った未実行タスクを現在位置の直後へ繰り下げる（F-113 §4.2-b）
  await applyCarryOverAfterPunch(punchDeps, { date: today, today, nowClock });
  revalidatePath("/");
  return { ok: true, createdId: result.value.id };
}

/**
 * ルーチン化（F-305 / 画面定義書01 §4.1）。
 * 楽観的更新の対象外なので、サーバ確定を待って結果を返す
 */
export async function createRoutineFromTaskAction(
  id: number,
  choice: RoutineFromTaskChoice
): Promise<DailyActionResult> {
  const result = await createRoutineFromTask(
    { routines: routineRepo, tasks: taskRepo },
    id,
    choice
  );
  if (!result.ok) return { ok: false, message: routineFromTaskErrorMessage(result.error) };
  // ルーチン一覧にも即座に現れるようにする（展開は翌日以降）
  revalidatePath("/routines");
  return { ok: true };
}

/** 先送り（F-107） */
export async function postponeTaskAction(id: number): Promise<DailyActionResult> {
  const result = await postponeTask(taskRepo, { taskId: id });
  if (!result.ok) return { ok: false, message: OPERATION_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}

/** 削除（O-8）。Undo のために削除したタスクを返す */
export async function deleteTaskAction(
  id: number
): Promise<Readonly<{ ok: true; deleted: Task } | { ok: false; message: string }>> {
  const result = await deleteTask(taskRepo, { taskId: id });
  if (!result.ok) return { ok: false, message: OPERATION_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true, deleted: result.value };
}

/** 削除の取り消し（O-8） */
export async function restoreTaskAction(deleted: Task): Promise<DailyActionResult> {
  const result = await restoreTask(taskRepo, deleted);
  if (!result.ok) return { ok: false, message: OPERATION_MESSAGES[result.error] };
  revalidatePath("/");
  return { ok: true };
}
