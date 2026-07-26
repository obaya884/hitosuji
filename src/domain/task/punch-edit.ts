// 打刻時刻のインライン修正（F-203 / 画面定義書01 §3.3・§8）
import { err, ok, type Result } from "../shared/result";
import { withZonedClockTime } from "../shared/time-zone";
import type { Task } from "./task";

export type PunchEditError =
  | "invalid_time"
  | "not_punched"
  | "ended_before_started"
  | "no_started_at";

/**
 * 時刻入力を「時・分」へ解釈する（画面定義書01 §3.3）。
 * `19:35` のほか、区切り文字なしの `1935` / `935` も受け付ける
 */
export function parseClockTime(raw: string): Result<{ hours: number; minutes: number }, PunchEditError> {
  const trimmed = raw.trim();

  const digits = /^(\d{1,2}):(\d{2})$/.exec(trimmed) ?? /^(\d{1,2})(\d{2})$/.exec(trimmed);
  if (digits === null) return err("invalid_time");

  const hours = Number(digits[1]);
  const minutes = Number(digits[2]);
  if (hours > 23 || minutes > 59) return err("invalid_time");

  return ok({ hours, minutes });
}

/**
 * 時刻入力を、元の打刻の暦日に当てはめた Date へ変換する。
 * 入力は運用タイムゾーン（引数で受け取る）の壁時計として解釈する——表示（`formatClock`）と同じ
 * 基準にそろえるため（T-47）。時刻だけを直す操作なので日付は動かさない（日をまたぐ実行中タスクの
 * 扱いは画面定義書01 §8）
 */
export function applyClockTime(
  base: Date,
  raw: string,
  timeZone: string
): Result<Date, PunchEditError> {
  const parsed = parseClockTime(raw);
  if (!parsed.ok) return parsed;

  return ok(withZonedClockTime(base, parsed.value.hours, parsed.value.minutes, timeZone));
}

/** 開始時刻の修正。終了済みなら 開始 ≦ 終了 を保つ（F-203） */
export function editStartedAt(
  task: Task,
  hhmm: string,
  timeZone: string
): Result<Date, PunchEditError> {
  if (task.startedAt === null) return err("not_punched");

  const applied = applyClockTime(task.startedAt, hhmm, timeZone);
  if (!applied.ok) return applied;

  if (task.endedAt !== null && applied.value.getTime() > task.endedAt.getTime()) {
    return err("ended_before_started");
  }
  return applied;
}

/** 終了時刻の修正。開始打刻がない状態では終了時刻を持てない（ck_tasks_time と同じ制約） */
export function editEndedAt(
  task: Task,
  hhmm: string,
  timeZone: string
): Result<Date, PunchEditError> {
  if (task.startedAt === null) return err("no_started_at");
  if (task.endedAt === null) return err("not_punched");

  const applied = applyClockTime(task.endedAt, hhmm, timeZone);
  if (!applied.ok) return applied;

  if (applied.value.getTime() < task.startedAt.getTime()) return err("ended_before_started");
  return applied;
}
