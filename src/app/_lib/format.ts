// 表示フォーマット（画面定義書01 §3.3）
import { APP_TIME_ZONE } from "@/domain/shared/time-zone";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

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
