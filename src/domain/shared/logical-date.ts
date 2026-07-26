// 論理日付 "YYYY-MM-DD"（データモデル定義書 §1: task_date は保存された論理日付。打刻時刻から導出しない）
// 日界の将来導入に備え、日付の計算はこの純関数群に閉じる
import { err, ok, type Result } from "./result";
import { zonedParts } from "./time-zone";

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

export function parseLogicalDate(value: string): Result<LogicalDate, "invalid_date"> {
  return isValidLogicalDate(value) ? ok(value) : err("invalid_date");
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
export function applyDayStart(
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
  dayStartMinutes: number,
  timeZone: string
): LogicalDate {
  const { year, month, day, hours, minutes } = zonedParts(now, timeZone);
  const calendarDate = toLogicalDate(new Date(Date.UTC(year, month - 1, day)));
  return applyDayStart(calendarDate, hours * 60 + minutes, dayStartMinutes);
}

/** 曜日（0=日）。表示用の曜日名は presentation で解決する */
export function weekdayIndex(date: LogicalDate): number {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}
