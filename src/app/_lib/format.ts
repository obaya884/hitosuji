// 表示フォーマット（画面定義書01 §3.3）と、時刻入力の正規化（同書 §3.3）
import { parseClockTime } from "@/domain/task/punch-edit";
import { dayOf, monthOf } from "@/domain/shared/month-grid";
import { carryOverDays, type Task } from "@/domain/task/task";
import { APP_TIME_ZONE, zonedParts } from "@/domain/shared/time-zone";

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/** 分を `H:MM` へ */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${String(m).padStart(2, "0")}`;
}

/**
 * 基準からの差を符号付きで表す。**差が無い（0）ときは符号を付けない**——符号は差の向きを
 * 示す記号なので、離れていない値に付けると「短く済んだ」「余裕がある」と読み違える。
 * 規則の本体は画面定義書04 §3.3（レビューの差異）にあり、画面定義書01 §3.2（セクション残り時間）がこれを引く
 */
export function formatSignedDuration(minutes: number): string {
  const sign = minutes > 0 ? "+" : minutes < 0 ? "-" : "";
  return `${sign}${formatDuration(Math.abs(minutes))}`;
}

/** 打刻時刻を `HH:MM` へ（表示は運用タイムゾーン＝日本時間。解釈・導出と同じ基準。T-47） */
export function formatClock(at: Date): string {
  const { hours, minutes } = zonedParts(at, APP_TIME_ZONE);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/**
 * 持ち越しの表記（F-122 / 画面定義書01 §3.3）。例: `3日持ち越し（9/18から）`。
 * **持ち越していない行では `null`**——呼び出し側はその場合に何も出さない。
 * 日数を先に置くのは、何の日数かを語で決めるため（`9/18から（3日）`では読み取れない）
 */
export function formatCarryOver(task: Task): string | null {
  const days = carryOverDays(task);
  if (days <= 0) return null;
  const { month } = monthOf(task.initialTaskDate);
  return `${days}日持ち越し（${month}/${dayOf(task.initialTaskDate)}から）`;
}

/** `YYYY-MM-DD(曜)`（画面定義書01 §3.1） */
export function formatLogicalDate(date: string, weekday: number): string {
  return `${date}(${WEEKDAYS[weekday]})`;
}

/**
 * 時刻入力を `HH:MM` へ正規化する。区切りなし入力（`0805` → `08:05`）も受け付ける
 * （画面定義書01 §3.3）。**解釈できなければ `null`**——呼び出し側は空文字等の
 * 「確実に無効な値」へ落として検証に委ねること（余剰つきの入力をそのまま送ると、サーバ側の
 * `normalizeStartTime` が先頭5文字を切り出すだけなので `09:05x` が `09:05` として黙って通る）
 */
export function normalizeClockInput(raw: string): string | null {
  const parsed = parseClockTime(raw);
  if (!parsed.ok) return null;
  const { hours, minutes } = parsed.value;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}
