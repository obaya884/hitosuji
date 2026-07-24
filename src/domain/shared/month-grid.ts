// datepicker（F-117 / 画面定義書01 §3.1）のカレンダーグリッドを組む純関数群。
// 表示は論理日付（"YYYY-MM-DD"）で扱い、月内/月外の判別は呼び出し側が month で行う。
import { addDays, toLogicalDate, weekdayIndex, type LogicalDate } from "./logical-date";

/** 週の起点。0=日曜, 1=月曜（画面定義書01 §3.1 は月曜始まり） */
export type WeekStart = 0 | 1;

export type YearMonth = Readonly<{ year: number; month: number }>;

/** 論理日付が属する年月（month は 1-12） */
export function monthOf(date: LogicalDate): YearMonth {
  const [year, month] = date.split("-").map(Number);
  return { year, month };
}

/** 論理日付の日（1-31）。monthOf と対で使う */
export function dayOf(date: LogicalDate): number {
  return Number(date.split("-")[2]);
}

/** 年月に delta か月を足す（負で過去へ）。月の桁上がり・桁下がりを吸収する */
export function addMonths({ year, month }: YearMonth, delta: number): YearMonth {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * 同じ日を保ったまま前月/翌月へ（datepicker の ◀/▶。画面定義書01 §3.1）。
 * 移動先にその日がなければその月末へ丸める（例: 1/31 の翌月 → 2月末）。
 */
export function shiftMonthKeepingDay(date: LogicalDate, delta: number): LogicalDate {
  const target = addMonths(monthOf(date), delta);
  const day = Math.min(dayOf(date), daysInMonth(target));
  return toLogicalDate(new Date(Date.UTC(target.year, target.month - 1, day)));
}

/** 年月の1日の論理日付 */
function firstOfMonth({ year, month }: YearMonth): LogicalDate {
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-01`;
}

/** 年月の日数（month は 1-12）。UTC 固定日での計算なので現在時刻に依存しない */
function daysInMonth({ year, month }: YearMonth): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * 指定した年月のカレンダーグリッド（週 × 7 日）を論理日付で返す（F-117 / 画面定義書01 §3.1）。
 * 週の起点に合わせて前月末・翌月頭で端を埋め、月内の全日を含む完全な週だけを並べる（4〜6 週）。
 */
export function monthGrid(
  target: YearMonth,
  weekStartsOn: WeekStart
): readonly (readonly LogicalDate[])[] {
  const first = firstOfMonth(target);
  // 1日を週の起点まで戻すぶんのリード日数
  const lead = (weekdayIndex(first) - weekStartsOn + 7) % 7;
  const start = addDays(first, -lead);
  const weeks = Math.ceil((lead + daysInMonth(target)) / 7);

  return Array.from({ length: weeks }, (_, w) =>
    Array.from({ length: 7 }, (_, d) => addDays(start, w * 7 + d))
  );
}
