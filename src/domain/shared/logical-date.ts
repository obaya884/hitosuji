// 論理日付 "YYYY-MM-DD"（データモデル定義書 §1: task_date は保存された論理日付。打刻時刻から導出しない）
// 日界（F-116）次第で打刻時刻の暦日と一致しない（既定の 00:00 なら一致する）。**論理日付の決定と、
// その逆向き（論理日の中の壁時計 → 絶対時刻）**はこの純関数群に閉じる——日界を起点にした
// 日またぎ判定・セクション枠の起点は `domain/task/projection.ts` と `domain/section/section.ts` が持つ
import { fromZonedClock, zonedParts } from "./time-zone";

export type LogicalDate = string;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isValidLogicalDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

/** 前日・翌日（F-106）。UTC 基準で計算するのでサマータイムの影響を受けない */
export function addDays(date: LogicalDate, days: number): LogicalDate {
  const [y, m, d] = date.split("-").map(Number);
  const shifted = new Date(Date.UTC(y, m - 1, d + days));
  return toLogicalDate(shifted);
}

/** Date（UTC の年月日）を論理日付文字列へ */
export function toLogicalDate(date: Date): LogicalDate {
  const y = String(date.getUTCFullYear()).padStart(4, "0");
  const m = String(date.getUTCMonth() + 1).padStart(2, "0");
  const d = String(date.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * 日界（分）を踏まえて論理日付を決める（F-116）。
 * 現在時刻の壁時計分（0時からの分）が日界より前なら、論理日付は前の暦日になる。
 * 日界が 0（既定の 00:00）なら常に暦日と一致する。
 */
function applyDayStart(
  calendarDate: LogicalDate,
  minuteOfDay: number,
  dayStartMinutes: number
): LogicalDate {
  return minuteOfDay < dayStartMinutes ? addDays(calendarDate, -1) : calendarDate;
}

/**
 * 現在時刻から「今日」（論理日付）を決める（F-116）。
 * 暦日と壁時計は運用タイムゾーンで読み、日界より前の時間帯は前の暦日を今日とする。
 * 日界が 0（既定の 00:00）なら暦日と一致する。
 */
export function todayLogicalDate(
  now: Date,
  timeZone: string,
  dayStartMinutes: number
): LogicalDate {
  const { year, month, day, hours, minutes } = zonedParts(now, timeZone);
  const calendarDate = toLogicalDate(new Date(Date.UTC(year, month - 1, day)));
  return applyDayStart(calendarDate, hours * 60 + minutes, dayStartMinutes);
}

/**
 * 論理日の中の壁時計（0時からの分）を絶対時刻にする（F-116 / 画面定義書01 §3.3）。
 * 1日は日界で始まり次の日界で終わるので、日界より前の時刻はその論理日の**翌暦日**に当たる
 * （論理日を決める `applyDayStart` の逆向き）。日界が 0（既定の 00:00）なら論理日の暦日そのもの。
 * 暦日と壁時計は運用タイムゾーン（引数）で読む（表示の `formatClock` と同じ基準。T-47）
 */
export function atLogicalDayClock(
  date: LogicalDate,
  minuteOfDay: number,
  timeZone: string,
  dayStartMinutes: number
): Date {
  const calendarDate = minuteOfDay < dayStartMinutes ? addDays(date, 1) : date;
  const [year, month, day] = calendarDate.split("-").map(Number);
  return fromZonedClock(
    { year, month, day, hours: Math.floor(minuteOfDay / 60), minutes: minuteOfDay % 60 },
    timeZone
  );
}

/** 曜日（0=日）。表示用の曜日名は presentation で解決する */
export function weekdayIndex(date: LogicalDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
