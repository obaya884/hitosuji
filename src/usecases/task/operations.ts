// 中断・複製・複製して開始・日付移動・削除のユースケース（F-204 / F-111 / F-208 / F-107・F-123 / O-8）
import type { RoutineSkip, TaskRepository } from "@/usecases/ports/task-repository";
import type { SectionRepository } from "@/usecases/ports/section-repository";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { err, ok, type Result } from "@/domain/shared/result";
import { planDateMove } from "@/domain/task/date-move";
import { planDuplicate, planDuplicateAndStart, planSuspend } from "@/domain/task/placement";
import { canFinish } from "@/domain/task/punch";
import type { PunchUsecaseError } from "@/usecases/task/punch-usecases";
import { newTaskFromPlan } from "@/usecases/task/from-draft";
import { taskStatus } from "@/domain/task/status";
import { appendSortOrder, tasksInSection } from "@/domain/task/sort-order";
import type { Task, TaskId } from "@/domain/task/task";

/**
 * 打刻ユースケースの失敗をそのまま含む（割り込み・中断が打刻の判断を通り、いずれの操作も
 * まずタスクを引くため）。`not_completed` は打刻ドメイン（`domain/task/punch.ts` の
 * `PunchError`）由来なので個別に足さない
 */
export type TaskOperationError = PunchUsecaseError | "not_date_movable";

/**
 * 中断（F-204）。実行中タスクを現在時刻で終了し、
 * 残り見積もりの再開タスクを直後に生成する（割り込みと同じ生成規則）
 */
export async function suspendTask(
  repo: TaskRepository,
  input: Readonly<{ taskId: TaskId; now: Date }>
): Promise<Result<TaskId, TaskOperationError>> {
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");

  const finishable = canFinish(target, input.now);
  if (!finishable.ok) return finishable;

  // 再開タスクは元タスクの直後（データモデル定義書 §4.2-a）。配置は domain の計画が決める
  const plan = planSuspend(target, await repo.listByDate(target.taskDate), input.now);
  await repo.suspend({
    taskId: target.id,
    endedAt: input.now,
    resumeTask: newTaskFromPlan(plan.resume, target.taskDate),
    renumber: plan.renumber,
  });
  return ok(target.id);
}

/**
 * 複製（F-111）。状態不問で複製し、未実行タスクとして**複製元の直下**へ挿入する（画面定義書01 O-11）。
 * 表示日が今日で複製元が現在位置より前にあるときは、この直後の描画で
 * 規則b（画面定義書01 §4.2-b）が現在位置へ繰り下げる
 */
export async function duplicateTask(
  repo: TaskRepository,
  input: Readonly<{ taskId: TaskId }>
): Promise<Result<Task, TaskOperationError>> {
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");

  const plan = planDuplicate(target, await repo.listByDate(target.taskDate));
  const created = await repo.create(
    newTaskFromPlan(plan.duplicate, target.taskDate),
    plan.renumber
  );
  return ok(created);
}

/**
 * 複製して開始（F-208 / 画面定義書01 O-14 / データモデル定義書 §4.6）。
 * 完了タスクを複製し、その複製タスクをすぐ開始する「もう一回」。複製元は完了のまま残す。
 * 複製タスクは開始済みで作るため、画面定義書01 §4.2-a に従い現在時刻を含むセクションの
 * 開始時刻順の位置へ置く（表示日が今日でないときは同書 §4.2-a を適用せず複製元と同じセクションへ置く）。
 * 他に実行中タスクがあれば F-201 の割り込み（終了＋再開タスク生成）をそのまま伴う。
 * 現在時刻はクライアントから受け取る（サーバ時刻を使わない）
 */
export async function duplicateAndStartTask(
  repos: Readonly<{ tasks: TaskRepository; sections: SectionRepository }>,
  input: Readonly<{ taskId: TaskId; now: Date; nowClock: string; today: LogicalDate }>
): Promise<Result<Task, TaskOperationError>> {
  const target = await repos.tasks.findById(input.taskId);
  if (target === null) return err("task_not_found");
  // TaskOperationError を返す操作でこのコードを返すのはここだけ（打刻の完了取り消しも同じコードを
  // 返すが文言は別）。文言は taskActionErrorMessage("duplicateAndStart", …) が持つ（T-74 / T-76）
  if (taskStatus(target) !== "completed") return err("not_completed");

  const [sameDay, sections, running] = await Promise.all([
    repos.tasks.listByDate(target.taskDate),
    repos.sections.listAll(),
    repos.tasks.findRunning(),
  ]);
  if (running !== null) {
    const finishable = canFinish(running, input.now);
    if (!finishable.ok) return finishable;
  }

  // 配置（移動先セクション・開始時刻順の位置・割り込みの再開タスク）は domain の計画が決める
  const plan = planDuplicateAndStart({
    target,
    sameDay,
    sections,
    running,
    now: input.now,
    nowClock: input.nowClock,
    isToday: target.taskDate === input.today,
  });

  const created = await repos.tasks.duplicateAndStart({
    newTask: newTaskFromPlan(plan.duplicate, target.taskDate),
    startedAt: input.now,
    interruption:
      plan.interruption === null
        ? null
        : {
            runningTaskId: plan.interruption.runningTaskId,
            endedAt: plan.interruption.endedAt,
            resumeTask: newTaskFromPlan(plan.interruption.resume, target.taskDate),
          },
    renumber: plan.renumber,
  });
  return ok(created);
}

/**
 * 日付移動（O-7 / F-107・F-123）。未実行タスクを別の日の**未分類の末尾**へ移す
 * （section_id を外すのはリポジトリ側。理由は `TaskRepository.moveToDate` の jsdoc）。
 * 行き先（今日なら翌日へ、そうでなければ今日へ）と postponed_count の加算可否は
 * `planDateMove` が決める。実行中・完了タスクには不可
 */
export async function moveTaskDate(
  repo: TaskRepository,
  input: Readonly<{ taskId: TaskId; today: LogicalDate }>
): Promise<Result<TaskId, TaskOperationError>> {
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");
  if (taskStatus(target) !== "not_started") return err("not_date_movable");

  const { to, countsAsPostpone } = planDateMove(target.taskDate, input.today);
  const destinationTasks = await repo.listByDate(to);
  // 採番の母集団は移動先の日の未分類（section_id を外すのはリポジトリ側）
  const unclassified = tasksInSection(destinationTasks, null);
  const sortOrder = appendSortOrder(unclassified.map((t) => t.sortOrder));

  await repo.moveToDate(
    target.id,
    { taskDate: to, sortOrder, countsAsPostpone },
    skipOf(target)
  );
  return ok(target.id);
}

/**
 * 削除（O-8）。Undo はクライアント側で「削除前のタスクを作り直す」形で実現する。
 * ルーチン由来のタスクは、その日を再展開しないようスキップも記録する（F-301）
 */
export async function deleteTask(
  repo: TaskRepository,
  input: Readonly<{ taskId: TaskId }>
): Promise<Result<Task, TaskOperationError>> {
  const target = await repo.findById(input.taskId);
  if (target === null) return err("task_not_found");

  await repo.delete(target.id, skipOf(target));
  return ok(target);
}

/** ルーチン由来のタスクなら、その日のスキップを表す（そうでなければ null） */
function skipOf(task: Task): RoutineSkip | null {
  return task.routineId === null
    ? null
    : { routineId: task.routineId, taskDate: task.taskDate };
}

/**
 * 削除の取り消し（O-8）。打刻・属性をそのままに復元する（id は採番し直される）。
 * ルーチン由来なら削除時に記録したスキップも解除する（F-301）
 */
export async function restoreTask(
  repo: TaskRepository,
  deleted: Task
): Promise<Result<Task, TaskOperationError>> {
  // id は復元先で採番し直されるので渡さない
  const { id, ...rest } = deleted;
  void id;
  return ok(await repo.restore(rest, skipOf(deleted)));
}
