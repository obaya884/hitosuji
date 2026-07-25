// 終了予定時刻と残時間（F-104）・予想開始時刻（F-120 / データモデル定義書 §4.3）
// DBには保存しない導出値。現在時刻は引数で受け取る（domain は now を持たない）
import { offsetFromDayStart, startMinutes } from "../section/section";
import { taskStatus } from "./status";
import { elapsedMinutes, type Task, type TaskId } from "./task";

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
 * 1タスクぶんの未完了見積もり（分）。完了は0、実行中は残り、未実行は見積もりそのまま。
 * 見積もり未設定（0分）は0として積まれる＝計算に含まれない（画面定義書01 §3.3）。
 * これの総和が `remainingMinutes`（データモデル定義書 §4.3 の「未完了見積もり」）
 */
function unfinishedMinutesOf(task: Task, now: Date): number {
  const status = taskStatus(task);
  if (status === "completed") return 0;

  if (status === "running") {
    const elapsed = elapsedMinutes(task, now) ?? 0;
    // 見積もりを超過していても残りは0（マイナスにしない）
    return Math.max(task.estimateMinutes - elapsed, 0);
  }
  return task.estimateMinutes;
}

/**
 * 残時間（分）= 実行中タスクの残り + 未実行タスクの見積もり合計。
 * 見積もり未設定（0分）は計算に含まれない（画面定義書01 §3.3）
 */
export function remainingMinutes(tasks: readonly Task[], now: Date): number {
  return tasks.reduce((sum, task) => sum + unfinishedMinutesOf(task, now), 0);
}

/** 終了予定時刻（F-104）= 現在時刻 + 残時間 */
export function projectedEndTime(tasks: readonly Task[], now: Date): Date {
  return new Date(now.getTime() + remainingMinutes(tasks, now) * 60_000);
}

/**
 * 未実行タスクの予想開始時刻（F-120 / データモデル定義書 §4.3）。終了予定時刻（F-104）と同じ
 * 積み上げの途中経過で、`now + 実行中タスクの残り + それより前にある未実行タスクの見積もり合計`。
 * `tasks` は表示順（画面定義書01 §3.2 の回転順 → sort_order）で渡す。実行中タスクの残りは
 * 積み上げの起点に常に含める（未実行行が実行中タスクより上にあっても引かない）ため、
 * 最後の未実行タスクの予想開始 + その見積もり = 終了予定時刻 が保たれる。
 * セクションをまたいでもリセットしない。戻り値は未実行タスクのみを持つ（実行中・完了は実打刻を持つ）
 */
export function projectedStartTimes(tasks: readonly Task[], now: Date): Map<TaskId, Date> {
  let offset = tasks
    .filter((task) => taskStatus(task) === "running")
    .reduce((sum, task) => sum + unfinishedMinutesOf(task, now), 0);

  const startTimes = new Map<TaskId, Date>();
  for (const task of tasks) {
    if (taskStatus(task) !== "not_started") continue;
    startTimes.set(task.id, new Date(now.getTime() + offset * 60_000));
    offset += task.estimateMinutes; // 未設定（0分）は0として積む（§4.3）
  }
  return startTimes;
}

/**
 * 論理日の暦日 0:00 を起点に測った時計数字（日界 F-116 を踏まえる。データモデル定義書 §4.3）。
 * 24:00 を超えると hours は 25, 26… と伸びる（折返し表記 `25:30` の材料）。
 * 既定（dayStartMinutes = 0）では now の暦日 0:00 起点。
 * 基準はランタイムのローカル時刻（実打刻の `formatClock` は JST 固定である点と異なる）
 */
function logicalClock(
  at: Date,
  now: Date,
  dayStartMinutes: number
): { hours: number; minutes: number } {
  const startOfBase = logicalBaseMidnight(now, dayStartMinutes);
  const minutesFromBase = Math.floor((at.getTime() - startOfBase.getTime()) / 60_000);
  return {
    hours: Math.floor(minutesFromBase / 60),
    minutes: ((minutesFromBase % 60) + 60) % 60,
  };
}

/**
 * 終了予定時刻の表示（F-104: 24:00超過は翌日表記 `25:30`）。
 * 折返しの時計数字は論理日の暦日 0:00 起点（日界 F-116 を踏まえる。データモデル定義書 §4.3）。
 * 既定（dayStartMinutes = 0）では now の暦日 0:00 起点で従来どおり。
 */
export function formatProjectedEnd(end: Date, now: Date, dayStartMinutes = 0): string {
  const { hours, minutes } = logicalClock(end, now, dayStartMinutes);
  return `${hours}:${String(minutes).padStart(2, "0")}`;
}

/**
 * 予想開始時刻の表示（F-120 / 画面定義書01 §3.3 の `HH:MM-` 形式）。返す文字列は `09:05–`。
 * 実打刻（`09:35–`）と同じ列に並ぶので、時は2桁ゼロ埋め・区切りも実打刻と同じ en dash に揃える。
 * 24:00 超過は終了予定と同じ論理日基準の折返し表記（`25:30–`）
 */
export function formatProjectedStart(start: Date, now: Date, dayStartMinutes = 0): string {
  const { hours, minutes } = logicalClock(start, now, dayStartMinutes);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}–`;
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
  const startOffset = offsetFromDayStart(startMinutes(startTime), dayStartMinutes);
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
