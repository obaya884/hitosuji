// ルーチン集約（データモデル定義書 §3.4 / 画面定義書02）
import type { ModeId } from "../mode/mode";
import type { ProjectId } from "../project/project";
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
  modeId: ModeId | null;
  projectId: ProjectId | null;
  recurrenceType: RecurrenceType;
  /** weekly のビットマスク（bit0=月 … bit6=日） */
  weekdays: number | null;
  /** weekly の週間隔（n週おき。1=毎週）。NULL は 1 として扱う（データモデル定義書 §3.4） */
  weekInterval: number | null;
  /** monthly の日。月末超過は月末に丸める */
  monthDay: number | null;
  /** interval の間隔（n日ごと） */
  intervalDays: number | null;
  startDate: LogicalDate;
  endDate: LogicalDate | null;
  isActive: boolean;
}>;

/**
 * 開始想定時刻と繰り返しの検証エラー。**ルーチン化（画面定義書01 §4.1）でも入力させる値**なので、
 * ルーチンフォーム全体の失敗（`RoutineError`）から切り出してある
 */
export type RoutineScheduleError =
  | "invalid_start_time"
  | "weekdays_required"
  | "invalid_week_interval"
  | "invalid_month_day"
  | "invalid_interval_days";

export type RoutineError =
  | NameError
  | RoutineScheduleError
  | "invalid_estimate"
  | "invalid_start_date"
  | "invalid_end_date"
  | "end_date_before_start_date";

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

/** 全曜日（月〜日）のビットマスク。WEEKDAY_BITS の7ビットがすべて立った状態 */
export const ALL_WEEKDAYS = 0b1111111;

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

/**
 * 曜日プリセット（画面定義書02 §4）。`weekdays` ビットマスクへの入力補助であり、
 * 繰り返し種別を増やすものではない（データモデル定義書 §3.4 は無変更）
 */
export const WEEKDAY_PRESETS = [
  { label: "平日", mask: 0b0011111 }, // 月〜金（bit0〜bit4）
  { label: "土日", mask: 0b1100000 }, // 土・日（bit5・bit6）
] as const;

/**
 * `weekdays` がプリセットと**ちょうど一致**するときだけその名前を返す（画面定義書02 §3）。
 * 余分な曜日を含む場合（例: 月火水木金土）は null を返し、呼び出し側は曜日を列挙する
 */
function weekdayPresetLabel(weekdays: number): string | null {
  return WEEKDAY_PRESETS.find((preset) => preset.mask === weekdays)?.label ?? null;
}

/** ビットマスクに含まれる曜日ラベル（月→日の順） */
function weekdayLabels(weekdays: number): readonly string[] {
  return WEEKDAY_BITS.filter((w) => (weekdays & (1 << w.bit)) !== 0).map((w) => w.label);
}

/** 繰り返しルールの人間可読な要約（画面定義書02 §3） */
export function describeRecurrence(routine: Routine): string {
  const base = (() => {
    switch (routine.recurrenceType) {
      case "daily":
        return "毎日";
      case "weekly": {
        // week_interval に応じて接頭を変える（1=週次 / 2=隔週 / n=n週ごと）。
        // NULL・1 以下は毎週扱い（occursOn の判定粒度と揃える）
        const interval = routine.weekInterval ?? 1;
        const prefix = interval <= 1 ? "週次" : interval === 2 ? "隔週" : `${interval}週ごと`;
        const weekdays = routine.weekdays ?? 0;
        const labels = weekdayLabels(weekdays);
        if (labels.length === 0) return prefix;
        // プリセットとちょうど一致するときは列挙をプリセット名に置き換える（FB-53）
        const daysLabel = weekdayPresetLabel(weekdays) ?? labels.join("・");
        return `${prefix}(${daysLabel})`;
      }
      case "monthly":
        return `月次(${routine.monthDay}日)`;
      case "interval":
        return `${routine.intervalDays}日ごと`;
    }
  })();

  return routine.endDate === null ? base : `${base} 〜${routine.endDate}`;
}
