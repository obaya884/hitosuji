// 運用タイムゾーンと、その壁時計で日時を読み書きする純関数（T-47）
// 時刻の解釈・導出・表示はアプリ全体で同じタイムゾーンに揃える（F-116 / データモデル定義書 §1）。
// domain は環境に依存しない規約なので、タイムゾーンは常に引数で受け取る（既定値も置かない）

/** 運用タイムゾーンは日本時間。日界（1日の開始時刻）は日界セクションで定める（F-116 / データモデル定義書 §1） */
export const APP_TIME_ZONE = "Asia/Tokyo";

/** あるタイムゾーンでの壁時計（時刻を持たない年月日と、時分） */
export type ZonedClock = Readonly<{
  year: number;
  month: number; // 1〜12
  day: number;
  hours: number;
  minutes: number;
}>;

export type ZonedParts = ZonedClock & Readonly<{ seconds: number }>;

// Intl.DateTimeFormat の生成は重いので、タイムゾーンごとに1つ持ち回す。
// 結果は引数だけで決まるため純粋性は保たれる（メモ化）
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  const cached = formatters.get(timeZone);
  if (cached !== undefined) return cached;

  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  formatters.set(timeZone, formatter);
  return formatter;
}

/** 絶対時刻を、指定タイムゾーンの壁時計として読む */
export function zonedParts(at: Date, timeZone: string): ZonedParts {
  const parts = formatterFor(timeZone).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hours: value("hour"),
    minutes: value("minute"),
    seconds: value("second"),
  };
}

/** 指定タイムゾーンの UTC からのずれ（ミリ秒）。夏時間を持つゾーンでは瞬間ごとに変わる */
function offsetMs(at: Date, timeZone: string): number {
  const { year, month, day, hours, minutes, seconds } = zonedParts(at, timeZone);
  const asIfUtc = Date.UTC(year, month - 1, day, hours, minutes, seconds);
  return asIfUtc - Math.floor(at.getTime() / 1000) * 1000;
}

/**
 * 指定タイムゾーンの壁時計から絶対時刻を作る（秒・ミリ秒は0）。
 * 日・月は Date.UTC と同じく繰り上がり・繰り下がりを許す（`day: 0` は前月末日）。
 * ずれは瞬間に依存するので、仮の瞬間で引いたずれを使って求め直す（夏時間の境界をまたぐ壁時計のため。
 * 運用タイムゾーンの Asia/Tokyo に夏時間は無いので実際は1回目で確定する）
 */
export function fromZonedClock(clock: ZonedClock, timeZone: string): Date {
  const asIfUtc = Date.UTC(clock.year, clock.month - 1, clock.day, clock.hours, clock.minutes);
  const firstGuess = asIfUtc - offsetMs(new Date(asIfUtc), timeZone);
  return new Date(asIfUtc - offsetMs(new Date(firstGuess), timeZone));
}

/**
 * 基準時刻と同じ暦日（指定タイムゾーン）の `hours:minutes` の絶対時刻。
 * 打刻の時刻だけを直す操作（F-203）で使う——日付は動かさない
 */
export function withZonedClockTime(
  base: Date,
  hours: number,
  minutes: number,
  timeZone: string
): Date {
  const { year, month, day } = zonedParts(base, timeZone);
  return fromZonedClock({ year, month, day, hours, minutes }, timeZone);
}
