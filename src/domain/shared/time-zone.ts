// 運用タイムゾーンと、その壁時計で日時を読み書きする純関数（T-47）
// 時刻の解釈・導出・表示はアプリ全体で同じタイムゾーンに揃える（F-116 / データモデル定義書 §1）。
// domain は環境に依存しない規約なので、タイムゾーンは常に引数で受け取る（既定値も置かない）。
//
// **夏時間に耐えるのは本モジュールの関数だけ**で、これを使う導出（`projection.ts` の折返し・
// セクション終了時刻）は「1日 = 24時間」を前提に分を足し引きしている。運用タイムゾーンの
// Asia/Tokyo に夏時間が無いので成り立つ前提で、他ゾーンへ広げるならそちらも見直しが要る

/** 運用タイムゾーンは日本時間。日界（1日の開始時刻）は日界セクションで定める（F-116 / データモデル定義書 §1） */
export const APP_TIME_ZONE = "Asia/Tokyo";

/** あるタイムゾーンでの壁時計（年月日＋時分。秒より下は扱わない） */
export type ZonedClock = Readonly<{
  year: number;
  month: number; // 1〜12
  day: number;
  hours: number;
  minutes: number;
}>;

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
    hourCycle: "h23",
  });
  formatters.set(timeZone, formatter);
  return formatter;
}

/** 絶対時刻を、指定タイムゾーンの壁時計として読む（秒は切り捨てる） */
export function zonedParts(at: Date, timeZone: string): ZonedClock {
  const parts = formatterFor(timeZone).formatToParts(at);
  // `?? "0"` は型のための防御で、要求した種別は必ず返るため到達しない（分岐カバレッジの穴）
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value ?? "0");

  return {
    year: value("year"),
    month: value("month"),
    day: value("day"),
    hours: value("hour"),
    minutes: value("minute"),
  };
}

/**
 * 指定タイムゾーンの UTC からのずれ（ミリ秒）。夏時間を持つゾーンでは瞬間ごとに変わる。
 * 分単位で測る（現行のタイムゾーンのずれはすべて分の整数倍。19世紀の地方平均時のような
 * 秒を含むずれは対象外）
 */
function offsetMs(at: Date, timeZone: string): number {
  const { year, month, day, hours, minutes } = zonedParts(at, timeZone);
  const asIfUtc = Date.UTC(year, month - 1, day, hours, minutes);
  return asIfUtc - Math.floor(at.getTime() / 60_000) * 60_000;
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
