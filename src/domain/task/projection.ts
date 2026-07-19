// 終了予定時刻と残時間（F-104 / データモデル定義書 §4.3）
// DBには保存しない導出値。現在時刻は引数で受け取る（domain は now を持たない）
import { taskStatus } from "./status";
import { elapsedMinutes, type Task } from "./task";

/**
 * 残時間（分）= 実行中タスクの残り + 未実行タスクの見積もり合計。
 * 見積もり未設定（0分）は計算に含まれない（画面定義書01 §3.3）
 */
export function remainingMinutes(tasks: readonly Task[], now: Date): number {
  return tasks.reduce((sum, task) => {
    const status = taskStatus(task);
    if (status === "completed") return sum;

    if (status === "running") {
      const elapsed = elapsedMinutes(task, now) ?? 0;
      // 見積もりを超過していても残りは0（マイナスにしない）
      return sum + Math.max(task.estimateMinutes - elapsed, 0);
    }
    return sum + task.estimateMinutes;
  }, 0);
}

/** 終了予定時刻（F-104）= 現在時刻 + 残時間 */
export function projectedEndTime(tasks: readonly Task[], now: Date): Date {
  return new Date(now.getTime() + remainingMinutes(tasks, now) * 60_000);
}

/**
 * 終了予定時刻の表示（F-104: 24:00超過は翌日表記 `25:30`）。
 * 基準日をまたいだ分だけ時に24を足す
 */
export function formatProjectedEnd(end: Date, baseDate: Date): string {
  const startOfBase = new Date(baseDate);
  startOfBase.setHours(0, 0, 0, 0);

  const minutesFromBase = Math.floor((end.getTime() - startOfBase.getTime()) / 60_000);
  const hours = Math.floor(minutesFromBase / 60);
  const minutes = ((minutesFromBase % 60) + 60) % 60;

  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/** 終了予定が翌日にずれ込むか（F-104: 警告色の判定に使う） */
export function isOverMidnight(end: Date, baseDate: Date): boolean {
  const startOfNextDay = new Date(baseDate);
  startOfNextDay.setHours(24, 0, 0, 0);
  return end.getTime() >= startOfNextDay.getTime();
}

/**
 * セクション枠の長さ（分）。開始時刻から終了時刻まで（日をまたぐ場合は24時間を足す）。
 * F-110 の「見積 2:30/3:00」の分母
 */
export function sectionCapacityMinutes(startTime: string, endTime: string): number {
  const toMinutes = (hhmm: string) => {
    const [h, m] = hhmm.split(":").map(Number);
    return h * 60 + m;
  };

  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  const span = end - start;
  return span > 0 ? span : span + 24 * 60;
}
