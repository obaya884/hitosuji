// 表示フォーマット（画面定義書01 §3.3）
import { applyDayStart } from "@/domain/shared/logical-date";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

// 運用タイムゾーンは日本時間。日界（1日の開始時刻）は日界セクションで定める（F-116 / データモデル定義書 §1）
export const APP_TIME_ZONE = "Asia/Tokyo";

/** 分を `H:MM` へ */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * 見積もりの表示。未設定（0分）は `--:--`（終了予定時刻の計算に含まれないことを示す）。
 * 実績には使わない（1分未満の実績は 0:00 と表示する。画面定義書01 §3.3）
 */
export function formatEstimate(minutes: number): string {
  return minutes <= 0 ? "--:--" : formatDuration(minutes);
}

/** 打刻時刻を `HH:MM` へ（表示は日本時間） */
export function formatClock(at: Date): string {
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(at);
}

/** `YYYY-MM-DD(曜)`（画面定義書01 §3.1） */
export function formatLogicalDate(date: string, weekday: number): string {
  return `${date}(${WEEKDAYS[weekday]})`;
}

/** 現在時刻の日本時間での「0時からの分」（日界判定に使う。F-116） */
function jstMinuteOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: APP_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? "0");
  return value("hour") * 60 + value("minute");
}

/**
 * 表示中の「今日」（論理日付）。日界（F-116）を踏まえて解決する。
 * 現在時刻の日本時間が日界時刻より前なら前の暦日を今日とする。既定 "00:00" では暦日と一致する。
 */
export function todayLogicalDate(now: Date = new Date(), dayStartTime = "00:00"): string {
  // en-CA は YYYY-MM-DD 形式
  const calendarDate = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  const [h, m] = dayStartTime.split(":").map(Number);
  const dayStartMinutes = h * 60 + m;
  if (dayStartMinutes === 0) return calendarDate; // 既定（深夜 00:00）は現状どおり暦日
  return applyDayStart(calendarDate, jstMinuteOfDay(now), dayStartMinutes);
}
