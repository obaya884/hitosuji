// 打刻時刻のインライン修正（F-203 / 画面定義書01 §3.3・§8）
import { atLogicalDayClock } from "../shared/logical-date";
import { err, ok, type Result } from "../shared/result";
import { fromZonedClock, zonedParts } from "../shared/time-zone";
import type { Task } from "./task";

export type PunchEditError =
  | "invalid_time"
  | "not_punched"
  | "ended_before_started"
  | "future_time"
  | "no_started_at";

/** 時刻入力を解釈した「時・分」（0時からの分ではなく壁時計そのもの） */
export type ClockTime = Readonly<{ hours: number; minutes: number }>;

/**
 * 打刻修正が拠って立つ環境。domain は現在時刻もタイムゾーンも持たないので呼び出し側が渡す。
 * 開始・終了で同じ形を受け取る（終了は日界を使わないが、画面は1つの文脈で両方を呼ぶ）
 */
export type PunchEditContext = Readonly<{
  timeZone: string;
  /** 日界の壁時計分（F-116）。開始時刻をどちらの暦日へ落とすかを決める */
  dayStartMinutes: number;
  /** 現在時刻。未来への修正を弾くために使う */
  now: Date;
}>;

/**
 * 時刻入力を「時・分」へ解釈する（画面定義書01 §3.3）。
 * `19:35` のほか、区切り文字なしの `1935` / `935` も受け付ける
 */
export function parseClockTime(raw: string): Result<ClockTime, PunchEditError> {
  const trimmed = raw.trim();

  const digits = /^(\d{1,2}):(\d{2})$/.exec(trimmed) ?? /^(\d{1,2})(\d{2})$/.exec(trimmed);
  if (digits === null) return err("invalid_time");

  const hours = Number(digits[1]);
  const minutes = Number(digits[2]);
  if (hours > 23 || minutes > 59) return err("invalid_time");

  return ok({ hours, minutes });
}

/** エポックからの分。入力も表示も分までなので、時刻の比較はこの粒度でそろえる */
function epochMinutes(at: Date): number {
  return Math.floor(at.getTime() / 60_000);
}

/** 未来へは修正できない（画面定義書01 §3.3）。現在時刻と同じ分は許す */
function isFuture(at: Date, now: Date): boolean {
  return epochMinutes(at) > epochMinutes(now);
}

/**
 * `hours:minutes` のうち `from` 以降で最も早い時刻（`from` と同じ暦日か、その翌暦日）。
 * 入力は運用タイムゾーン（引数）の壁時計として解釈する——表示（`formatClock`）と同じ基準に
 * そろえるため（T-47）
 */
function firstClockAtOrAfter(from: Date, clock: ClockTime, timeZone: string): Date {
  const { year, month, day } = zonedParts(from, timeZone);
  const sameDay = fromZonedClock({ year, month, day, ...clock }, timeZone);
  return epochMinutes(sameDay) >= epochMinutes(from)
    ? sameDay
    : fromZonedClock({ year, month, day: day + 1, ...clock }, timeZone);
}

/**
 * 開始時刻の修正（F-203）。入力は**そのタスクが属する論理日の時刻**として読むので、日界（F-116）
 * より前の時刻は論理日の翌暦日に落ちる（画面定義書01 §3.3）。落とし先は `task_date` と日界だけで
 * 決まり、いつ確定しても同じ結果になる。未来は不可・終了済みなら 開始 ≦ 終了 を保つ
 */
export function editStartedAt(
  task: Task,
  hhmm: string,
  context: PunchEditContext
): Result<Date, PunchEditError> {
  if (task.startedAt === null) return err("not_punched");

  const parsed = parseClockTime(hhmm);
  if (!parsed.ok) return parsed;

  const applied = atLogicalDayClock(
    task.taskDate,
    parsed.value.hours * 60 + parsed.value.minutes,
    context.timeZone,
    context.dayStartMinutes
  );

  if (isFuture(applied, context.now)) return err("future_time");
  if (task.endedAt !== null && applied.getTime() > task.endedAt.getTime()) {
    return err("ended_before_started");
  }
  return ok(applied);
}

/**
 * 終了時刻の修正（F-203）。入力は**開始時刻以降で最も早い候補**として読むので、日をまたいで
 * 走り続けたタスクの終了（画面定義書01 §8）も入れられる。組み立てが 開始 ≦ 終了 を保証する
 * ため向きの検査は要らない（秒の分だけ手前に落ちる場合は下で開始時刻へ寄せる）。
 * 開始打刻がない状態では終了時刻を持てない（ck_tasks_time と同じ制約）
 */
export function editEndedAt(
  task: Task,
  hhmm: string,
  context: PunchEditContext
): Result<Date, PunchEditError> {
  if (task.startedAt === null) return err("no_started_at");
  if (task.endedAt === null) return err("not_punched");

  const parsed = parseClockTime(hhmm);
  if (!parsed.ok) return parsed;

  const candidate = firstClockAtOrAfter(task.startedAt, parsed.value, context.timeZone);
  // 開始と同じ分を指したときは開始時刻そのものへ寄せる。打刻は秒を持つ（`new Date()`）ので、
  // 分の頭に落とすと絶対時刻では開始より前になり ck_tasks_time に触れる（実績は 0:00 表示）
  const applied = candidate.getTime() < task.startedAt.getTime() ? task.startedAt : candidate;

  return isFuture(applied, context.now) ? err("future_time") : ok(applied);
}
