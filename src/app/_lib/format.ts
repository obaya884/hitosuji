// 表示フォーマット（画面定義書01 §3.3）
const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

// MVP は日界0:00固定・日本時間で運用する（要件定義書 §8-5）
export const APP_TIME_ZONE = "Asia/Tokyo";

/** 分を `H:MM` へ。未設定（0分）は `--:--`（見積もりが計算に含まれないことを示す） */
export function formatMinutes(minutes: number): string {
  if (minutes <= 0) return "--:--";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
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

/** 表示中の「今日」。日界は 0:00 固定なので日本時間の暦日をそのまま使う */
export function todayLogicalDate(now: Date = new Date()): string {
  // en-CA は YYYY-MM-DD 形式
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
