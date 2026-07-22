// 終了予定時刻と残時間（F-104 / データモデル定義書 §4.3）
// DBには保存しない導出値。現在時刻は引数で受け取る（domain は now を持たない）
import { startMinutes } from "../section/section";
import { taskStatus } from "./status";
import { elapsedMinutes, type Task } from "./task";

/**
 * 現在時刻が属する論理日の暦日 0:00（F-116）。日界（分）より前の時間帯は前の暦日が起点になる。
 * 折返し表記・超過警告・セクション終了時刻を、暦日 0:00 ではなく論理日の区切りで測るための基準。
 * 既定（dayStartMinutes = 0）では now の暦日 0:00 に一致する。
 */
function logicalBaseMidnight(now: Date, dayStartMinutes: number): Date {
  const base = new Date(now);
  base.setHours(0, 0, 0, 0);
  if (now.getHours() * 60 + now.getMinutes() < dayStartMinutes) {
    base.setDate(base.getDate() - 1);
  }
  return base;
}

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
 * 折返しの時計数字は論理日の暦日 0:00 起点（日界 F-116 を踏まえる。データモデル定義書 §4.3）。
 * 既定（dayStartMinutes = 0）では now の暦日 0:00 起点で従来どおり。
 */
export function formatProjectedEnd(end: Date, now: Date, dayStartMinutes = 0): string {
  const startOfBase = logicalBaseMidnight(now, dayStartMinutes);

  const minutesFromBase = Math.floor((end.getTime() - startOfBase.getTime()) / 60_000);
  const hours = Math.floor(minutesFromBase / 60);
  const minutes = ((minutesFromBase % 60) + 60) % 60;

  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/**
 * 終了予定が論理日の区切り（次の日界）を越えるか（F-104: 警告色の判定に使う）。
 * 既定（dayStartMinutes = 0）では暦日 24:00 超過に一致する（データモデル定義書 §4.3）。
 */
export function isOverMidnight(end: Date, now: Date, dayStartMinutes = 0): boolean {
  const base = logicalBaseMidnight(now, dayStartMinutes);
  const nextDayStart = base.getTime() + (24 * 60 + dayStartMinutes) * 60_000;
  return end.getTime() >= nextDayStart;
}

/**
 * セクション終了時刻を絶対時刻（Date）で返す。論理日の区切り（日界 F-116）を基準に、
 * セクション開始の絶対時刻（日界からの巡回位置）へ枠の長さ（sectionCapacityMinutes）を足す。
 * これにより日界を跨ぐ枠（回転で末尾に来る深夜など）も同じ論理日の中で正しく測れる。
 * 既定（dayStartMinutes = 0）では now の暦日で解釈する従来挙動に一致する。
 * セクション残り時間は表示日=今日のときだけ出す（画面定義書01 §3.2）ため、now の暦日 = 表示日となる。
 */
export function sectionEndAt(
  now: Date,
  startTime: string,
  endTime: string,
  dayStartMinutes = 0
): Date {
  const base = logicalBaseMidnight(now, dayStartMinutes);
  const startOffset = (startMinutes(startTime) - dayStartMinutes + 1440) % 1440;
  const startAbs = base.getTime() + (dayStartMinutes + startOffset) * 60_000;
  return new Date(startAbs + sectionCapacityMinutes(startTime, endTime) * 60_000);
}

/**
 * セクションの残り時間（分, F-110）= (セクション終了時刻 − now) − そのセクションの未完了見積もり。
 * 終了予定時刻（F-104）のセクション版で、マイナスはそのセクションに予定が収まらないこと（データモデル定義書 §4.3）。
 * 現在時刻依存のため、意味を持つ（表示日=今日・now < 終了時刻）のは呼び出し側で判定する（画面定義書01 §3.2）
 */
export function sectionRemainingMinutes(
  sectionEndAt: Date,
  tasks: readonly Task[],
  now: Date
): number {
  const untilEnd = Math.floor((sectionEndAt.getTime() - now.getTime()) / 60_000);
  return untilEnd - remainingMinutes(tasks, now);
}

/**
 * セクション枠の長さ（分）。開始時刻から終了時刻まで（日をまたぐ場合は24時間を足す）。
 * F-110 の「合計 2:30/3:00」の分母
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
