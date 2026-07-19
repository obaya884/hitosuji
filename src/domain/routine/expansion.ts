// ルーチンの展開判定（F-301/302 / データモデル定義書 §4.1）
// 判定は純関数。実際の INSERT は infrastructure が冪等に行う
import { compareByName } from "../shared/name-order";
import { weekdayIndex, type LogicalDate } from "../shared/logical-date";
import { hasWeekday, type Routine } from "./routine";

/** 論理日付の差（日数）。どちらも UTC 基準で解釈する */
function daysBetween(from: LogicalDate, to: LogicalDate): number {
  const parse = (d: LogicalDate) => {
    const [y, m, day] = d.split("-").map(Number);
    return Date.UTC(y, m - 1, day);
  };
  return Math.round((parse(to) - parse(from)) / 86_400_000);
}

/** その月の日数（月末丸めに使う） */
function daysInMonth(date: LogicalDate): number {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function dayOfMonth(date: LogicalDate): number {
  return Number(date.split("-")[2]);
}

/**
 * ルーチンが日付 D に該当するか（データモデル定義書 §4.1-1）。
 * 有効期間（start_date <= D <= end_date）と is_active も併せて判定する
 */
export function occursOn(routine: Routine, date: LogicalDate): boolean {
  if (!routine.isActive) return false;
  if (date < routine.startDate) return false;
  if (routine.endDate !== null && date > routine.endDate) return false;

  switch (routine.recurrenceType) {
    case "daily":
      return true;

    case "weekly":
      return routine.weekdays !== null && hasWeekday(routine.weekdays, weekdayIndex(date));

    case "monthly": {
      if (routine.monthDay === null) return false;
      // 月末超過は月末に丸める（例: 31日指定の2月は月末が該当日）
      const target = Math.min(routine.monthDay, daysInMonth(date));
      return dayOfMonth(date) === target;
    }

    case "interval": {
      if (routine.intervalDays === null || routine.intervalDays <= 0) return false;
      return daysBetween(routine.startDate, date) % routine.intervalDays === 0;
    }
  }
}

/**
 * 日付 D に展開すべきルーチンを、生成順（開始想定時刻の昇順・同時刻は名前の自然順）で返す
 * （データモデル定義書 §4.1-2）。過去日は展開しない（§4.1-0）
 */
export function routinesToExpand(
  routines: readonly Routine[],
  date: LogicalDate,
  today: LogicalDate
): Routine[] {
  if (date < today) return []; // 過去日は展開しない

  return routines
    .filter((routine) => occursOn(routine, date))
    .sort(
      (a, b) =>
        a.scheduledStartTime.localeCompare(b.scheduledStartTime) || compareByName(a, b)
    );
}
