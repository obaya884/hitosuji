// ルーチン集約（データモデル定義書 §3.4 / 画面定義書02）
import type { LogicalDate } from "../shared/logical-date";
import type { NameError } from "../shared/master-name";

export type RoutineId = number;

export type RecurrenceType = "daily" | "weekly" | "monthly" | "interval";

export type Routine = Readonly<{
  id: RoutineId;
  name: string;
  estimateMinutes: number;
  /** 開始想定時刻 "HH:MM"。展開順とセクション配置の導出に使う（予約時刻ではない） */
  scheduledStartTime: string;
  modeId: number | null;
  projectId: number | null;
  recurrenceType: RecurrenceType;
  /** weekly のビットマスク（bit0=月 … bit6=日） */
  weekdays: number | null;
  /** monthly の日。月末超過は月末に丸める */
  monthDay: number | null;
  /** interval の間隔（n日ごと） */
  intervalDays: number | null;
  startDate: LogicalDate;
  endDate: LogicalDate | null;
  isActive: boolean;
}>;

export type RoutineError =
  | NameError
  | "invalid_estimate"
  | "invalid_start_time"
  | "invalid_start_date"
  | "invalid_end_date"
  | "end_date_before_start_date"
  | "weekdays_required"
  | "invalid_month_day"
  | "invalid_interval_days";

/** 曜日ビットマスク（bit0=月 … bit6=日）。Date の getUTCDay（0=日）とは並びが違う */
export const WEEKDAY_BITS = [
  { bit: 0, label: "月" },
  { bit: 1, label: "火" },
  { bit: 2, label: "水" },
  { bit: 3, label: "木" },
  { bit: 4, label: "金" },
  { bit: 5, label: "土" },
  { bit: 6, label: "日" },
] as const;

/** 日曜=0 の曜日インデックスを、月曜=0 のビット位置へ変換する */
export function weekdayBitOf(weekdayIndex: number): number {
  return (weekdayIndex + 6) % 7;
}

export function hasWeekday(weekdays: number, weekdayIndex: number): boolean {
  return (weekdays & (1 << weekdayBitOf(weekdayIndex))) !== 0;
}

export function toggleWeekday(weekdays: number, bit: number): number {
  return weekdays ^ (1 << bit);
}

/** 繰り返しルールの人間可読な要約（画面定義書02 §3） */
export function describeRecurrence(routine: Routine): string {
  const base = (() => {
    switch (routine.recurrenceType) {
      case "daily":
        return "毎日";
      case "weekly": {
        const days = WEEKDAY_BITS.filter(
          (w) => routine.weekdays !== null && (routine.weekdays & (1 << w.bit)) !== 0
        ).map((w) => w.label);
        return days.length === 0 ? "週次" : `週次(${days.join("・")})`;
      }
      case "monthly":
        return `月次(${routine.monthDay}日)`;
      case "interval":
        return `${routine.intervalDays}日ごと`;
    }
  })();

  return routine.endDate === null ? base : `${base} 〜${routine.endDate}`;
}
