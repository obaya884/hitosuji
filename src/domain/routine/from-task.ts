// タスクからのルーチン化（画面定義書01 §4.1 / O-12、F-305）
import { actualMinutes, type Task } from "../task/task";
import { addDays, weekdayIndex, type LogicalDate } from "../shared/logical-date";
import { err, ok, type Result } from "../shared/result";
import {
  validateRoutineSchedule,
  type RoutineScheduleInput,
  type ValidRoutineInput,
} from "./input";
import { weekdayBitOf, type RoutineScheduleError } from "./routine";

/**
 * ルーチン化の失敗（画面定義書01 §4.1）。**入力させる値の検証エラーだけを含む**——
 * 名前・見積もり・開始日はタスクから引き継ぐか固定値で、失敗しうる形では作られない
 */
export type RoutineFromTaskError =
  | "estimate_required"
  | "routine_derived_task"
  | RoutineScheduleError;

/** ポップオーバーの入力値（画面定義書01 §4.1）。入れさせるのは予定（時刻と繰り返し）だけ */
export type RoutineFromTaskChoice = RoutineScheduleInput;

/** 論理日付 "YYYY-MM-DD" の日部分（1〜31）を取り出す */
function dayOfMonth(date: LogicalDate): number {
  return Number(date.split("-")[2]);
}

/**
 * ポップオーバーの初期表示に使う既定値（画面定義書01 §4.1）。
 * 開始想定時刻は日本時間への変換が要る（domain では時刻の書式化をしない）ため、
 * 呼び出し側が "HH:MM" を算出して渡す。
 * 種別が daily でも weekdays / monthDay / intervalDays には既定値を入れておく
 * （種別切り替え時に再計算せず使えるようにするため。不要な項目は validateRoutineSchedule が null に落とす）
 */
export function defaultChoiceFromTask(
  task: Task,
  scheduledStartTime: string
): RoutineFromTaskChoice {
  const weekdayBit = weekdayBitOf(weekdayIndex(task.taskDate));

  return {
    recurrenceType: "daily",
    weekdays: 1 << weekdayBit,
    weekInterval: 1, // 既定は毎週（週次に切り替えたときの初期値）
    monthDay: dayOfMonth(task.taskDate),
    intervalDays: 2,
    scheduledStartTime,
  };
}

/**
 * ルーチンの見積もり分数を決める（画面定義書01 §4.1「見積もり0分（未設定）の扱い」）。
 * 見積もりがあればそれを使う。0分（未設定）なら実績の分数を使う（最低1分）。
 * 実績もない（未実行かつ見積もり0分）場合はエラー
 */
function routineEstimateFromTask(task: Task): Result<number, "estimate_required"> {
  if (task.estimateMinutes > 0) return ok(task.estimateMinutes);

  const actual = actualMinutes(task);
  if (actual === null) return err("estimate_required");

  // ルーチンは1分以上必須（画面定義書02 §5）。1分未満に丸まる実績も最低1分に引き上げる
  return ok(Math.max(actual, 1));
}

/**
 * タスク＋入力 → 検証済みのルーチン入力（画面定義書01 §4.1）。
 * **名前・見積もり・開始日はここで検証しない**——名前はタスク名をそのまま引き継ぎ
 * （タスク名は空にできない。画面定義書01 §8）、見積もりは上の関数が1分以上を保証し、
 * 開始日は `task_date + 1`・終了日は無期限で固定する。検証が要るのは入力させる予定だけ
 */
export function routineInputFromTask(
  task: Task,
  choice: RoutineFromTaskChoice
): Result<ValidRoutineInput, RoutineFromTaskError> {
  // ルーチン由来タスクからは作成できない（既にルーチンがあるため。UI側の多重防御）
  if (task.routineId !== null) return err("routine_derived_task");

  const estimate = routineEstimateFromTask(task);
  if (!estimate.ok) return estimate;

  const schedule = validateRoutineSchedule(choice);
  if (!schedule.ok) return schedule;

  return ok({
    name: task.name,
    estimateMinutes: estimate.value,
    modeId: task.modeId,
    projectId: task.projectId,
    // ルーチン化ではバンドルを選ばせない（画面定義書01 §4.1）。所属させたければ S-02 で編集する
    bundleId: null,
    ...schedule.value,
    // 開始日は翌日（元タスクが今日のリストに既にあるため、当日再展開での重複を防ぐ）
    startDate: addDays(task.taskDate, 1),
    // 終了日なし（無期限で作成する）
    endDate: null,
  });
}
