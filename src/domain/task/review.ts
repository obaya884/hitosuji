// レビュー画面の導出（S-04 / 画面定義書04 §3）。集計はすべて引数のタスクから導く
import { sortedBySortOrder } from "./sort-order";
import { actualMinutes, type StartedTask, type Task } from "./task";

function isStarted(task: Task): task is StartedTask {
  return task.startedAt !== null;
}

/**
 * 実績ログ（F-501 / §3.3）: 実行済みタスクを開始時刻の昇順で並べる。
 * 絞り込んだ事実を戻り型でも言うので、受け手は開始時刻の null を扱わなくてよい
 */
export function executionLog(tasks: readonly Task[]): readonly StartedTask[] {
  return tasks
    .filter(isStarted)
    .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime());
}

/**
 * 先送りタスク（F-502 / §3.4）: その日に残っている未実行タスク。
 * 他日へ移した分は移動先の日に属するため含まれない
 */
export function postponedTasks(tasks: readonly Task[]): readonly Task[] {
  return sortedBySortOrder(tasks.filter((t) => t.startedAt === null));
}

/** 実績時間の合計（分）。実行中タスクは実績が確定していないため加算しない（§3.3） */
export function totalActualMinutes(tasks: readonly Task[]): number {
  return tasks.reduce((sum, task) => sum + (actualMinutes(task) ?? 0), 0);
}

/**
 * 見積もりとの差異（分。§3.3）。正なら超過。
 * 実績が確定していない行と、見積もり未設定（0分）の行は差異を出さない
 */
export function estimateDiffMinutes(task: Task): number | null {
  const actual = actualMinutes(task);
  if (actual === null || task.estimateMinutes <= 0) return null;
  return actual - task.estimateMinutes;
}

/** 集計の1行（§3.5）。key はモードID / プロジェクトID、未設定は null */
export type ActualTotal = Readonly<{ key: number | null; minutes: number }>;

/**
 * 軸ごとの実績時間合計（F-503 / §3.5）。実績時間の降順、未設定（null）は最後。
 * 実績0分の軸は行にしない（打刻直後で 0 分のものが並ぶのを避ける）
 */
export function totalActualMinutesBy(
  tasks: readonly Task[],
  keyOf: (task: Task) => number | null
): readonly ActualTotal[] {
  const totals = new Map<number | null, number>();
  for (const task of tasks) {
    const minutes = actualMinutes(task);
    if (minutes === null) continue;
    const key = keyOf(task);
    totals.set(key, (totals.get(key) ?? 0) + minutes);
  }
  return [...totals]
    .filter(([, minutes]) => minutes > 0)
    .map(([key, minutes]) => ({ key, minutes }))
    .sort((a, b) => {
      // 未設定は実績によらず最後に置く（§3.5）
      if (a.key === null) return 1;
      if (b.key === null) return -1;
      return b.minutes - a.minutes;
    });
}

/** 期間の実績合計に対する割合（整数%。§3.5）。合計が0なら0% */
export function sharePercent(minutes: number, totalMinutes: number): number {
  if (totalMinutes <= 0) return 0;
  return Math.round((minutes / totalMinutes) * 100);
}
