// ルーチンの入力検証（画面定義書02 §4）
import type { ModeId } from "../mode/mode";
import type { ProjectId } from "../project/project";
import { isValidLogicalDate, type LogicalDate } from "../shared/logical-date";
import { validateName } from "../shared/master-name";
import { err, ok, type Result } from "../shared/result";
import { isValidStartTime, normalizeStartTime } from "../section/section";
import {
  ALL_WEEKDAYS,
  type RecurrenceType,
  type RoutineError,
  type RoutineScheduleError,
} from "./routine";

/** いつ・どの周期で展開するかの入力（未検証の生値）。ルーチン化（画面定義書01 §4.1）もこれを入れる */
export type RoutineScheduleInput = Readonly<{
  scheduledStartTime: string;
  recurrenceType: RecurrenceType;
  weekdays: number | null;
  weekInterval: number | null;
  monthDay: number | null;
  intervalDays: number | null;
}>;

/** フォームからの入力（未検証の生値） */
export type RoutineInput = RoutineScheduleInput &
  Readonly<{
    name: string;
    estimateMinutes: number;
    modeId: ModeId | null;
    projectId: ProjectId | null;
    startDate: string;
    endDate: string | null;
  }>;

/** 保存する繰り返しの値。正規化で種別自体が変わりうるため recurrenceType も含む */
type RecurrenceFields = Readonly<{
  recurrenceType: RecurrenceType;
  weekdays: number | null;
  weekInterval: number | null;
  monthDay: number | null;
  intervalDays: number | null;
}>;

/** 検証済みの予定（開始想定時刻は正規化済み、繰り返しは §3.4 の正規化を経た保存値） */
export type ValidRoutineSchedule = Readonly<{ scheduledStartTime: string }> & RecurrenceFields;

/** 検証済みの入力（永続化に渡せる形） */
export type ValidRoutineInput = ValidRoutineSchedule &
  Readonly<{
    name: string;
    estimateMinutes: number;
    modeId: ModeId | null;
    projectId: ProjectId | null;
    startDate: LogicalDate;
    endDate: LogicalDate | null;
  }>;

/**
 * 開始想定時刻と繰り返しを検証する（画面定義書02 §4 / 01 §4.1）。
 * ルーチンフォームとルーチン化ポップオーバーが同じ規則で通る唯一の入口
 */
export function validateRoutineSchedule(
  input: RoutineScheduleInput
): Result<ValidRoutineSchedule, RoutineScheduleError> {
  const scheduledStartTime = normalizeStartTime(input.scheduledStartTime);
  if (!isValidStartTime(scheduledStartTime)) return err("invalid_start_time");

  const recurrence = validateRecurrence(input);
  if (!recurrence.ok) return recurrence;

  return ok({ scheduledStartTime, ...recurrence.value });
}

/** フォーム全体を検証する（画面定義書02 §4）。予定の部分は `validateRoutineSchedule` に委ねる */
export function validateRoutineInput(
  input: RoutineInput
): Result<ValidRoutineInput, RoutineError> {
  const name = validateName(input.name);
  if (!name.ok) return name;

  // 見積もりは必須（画面定義書02 §4）。0分は「未設定」であり展開後に見積もりのないタスクになる
  if (!Number.isSafeInteger(input.estimateMinutes) || input.estimateMinutes <= 0) {
    return err("invalid_estimate");
  }

  // 検証はフォームの項目順（画面定義書02 §4）に沿う。複数が不正なとき、先に直すべき欄の
  // エラーから出す（表示は1件ずつ。共通 §4.1）
  const schedule = validateRoutineSchedule(input);
  if (!schedule.ok) return schedule;

  if (!isValidLogicalDate(input.startDate)) return err("invalid_start_date");
  if (input.endDate !== null && input.endDate !== "") {
    if (!isValidLogicalDate(input.endDate)) return err("invalid_end_date");
    if (input.endDate < input.startDate) return err("end_date_before_start_date");
  }
  const endDate = input.endDate === null || input.endDate === "" ? null : input.endDate;

  return ok({
    name: name.value,
    estimateMinutes: input.estimateMinutes,
    modeId: input.modeId,
    projectId: input.projectId,
    ...schedule.value,
    startDate: input.startDate,
    endDate,
  });
}

/** 毎日の保存値（週次・月次・n日ごとの項目はすべて null。データモデル定義書 §3.4） */
const DAILY_RECURRENCE: RecurrenceFields = {
  recurrenceType: "daily",
  weekdays: null,
  weekInterval: null,
  monthDay: null,
  intervalDays: null,
};

/**
 * 繰り返し種別ごとに必要な項目を検証する（画面定義書02 §4）。
 * 種別に関係しない項目は null に落として保存する（週次を月次に変えた際の残骸を防ぐ）。
 * 週次で全曜日かつ週間隔1の入力は「毎日」へ正規化する（データモデル定義書 §3.4）
 */
function validateRecurrence(
  input: RoutineScheduleInput
): Result<RecurrenceFields, RoutineScheduleError> {
  switch (input.recurrenceType) {
    case "daily":
      return ok(DAILY_RECURRENCE);

    case "weekly": {
      // 曜日は1つ以上必須（画面定義書02 §4）
      if (input.weekdays === null || input.weekdays === 0) return err("weekdays_required");
      // 週間隔は 1〜53 の整数（1=毎週。上限は1年が触れうる最大週数。データモデル定義書 §3.4）
      if (
        input.weekInterval === null ||
        !Number.isSafeInteger(input.weekInterval) ||
        input.weekInterval < 1 ||
        input.weekInterval > 53
      ) {
        return err("invalid_week_interval");
      }
      // 全曜日かつ毎週は「毎日」と同義なので daily へ寄せる（データモデル定義書 §3.4）。
      // 週間隔2以上は「n週おきに、その週だけ7日連続」で daily では表せないため寄せない
      // （週間隔はここまでで 1〜53 の整数に絞られており、NULL はこの分岐に来ない）
      if (input.weekdays === ALL_WEEKDAYS && input.weekInterval === 1) {
        return ok(DAILY_RECURRENCE);
      }
      return ok({
        recurrenceType: "weekly",
        weekdays: input.weekdays,
        weekInterval: input.weekInterval,
        monthDay: null,
        intervalDays: null,
      });
    }

    case "monthly":
      if (
        input.monthDay === null ||
        !Number.isSafeInteger(input.monthDay) ||
        input.monthDay < 1 ||
        input.monthDay > 31
      ) {
        return err("invalid_month_day");
      }
      return ok({
        recurrenceType: "monthly",
        weekdays: null,
        weekInterval: null,
        monthDay: input.monthDay,
        intervalDays: null,
      });

    case "interval":
      if (
        input.intervalDays === null ||
        !Number.isSafeInteger(input.intervalDays) ||
        input.intervalDays < 1
      ) {
        return err("invalid_interval_days");
      }
      return ok({
        recurrenceType: "interval",
        weekdays: null,
        weekInterval: null,
        monthDay: null,
        intervalDays: input.intervalDays,
      });
  }
}
