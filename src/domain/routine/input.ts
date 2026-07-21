// ルーチンの入力検証（画面定義書02 §4）
import { isValidLogicalDate, type LogicalDate } from "../shared/logical-date";
import { validateName } from "../shared/master-name";
import { err, ok, type Result } from "../shared/result";
import { isValidStartTime, normalizeStartTime } from "../section/section";
import type { RecurrenceType, RoutineError } from "./routine";

/** フォームからの入力（未検証の生値） */
export type RoutineInput = Readonly<{
  name: string;
  estimateMinutes: number;
  scheduledStartTime: string;
  modeId: number | null;
  projectId: number | null;
  recurrenceType: RecurrenceType;
  weekdays: number | null;
  monthDay: number | null;
  intervalDays: number | null;
  startDate: string;
  endDate: string | null;
}>;

/** 検証済みの入力（永続化に渡せる形） */
export type ValidRoutineInput = Readonly<{
  name: string;
  estimateMinutes: number;
  scheduledStartTime: string;
  modeId: number | null;
  projectId: number | null;
  recurrenceType: RecurrenceType;
  weekdays: number | null;
  monthDay: number | null;
  intervalDays: number | null;
  startDate: LogicalDate;
  endDate: LogicalDate | null;
}>;

/**
 * 繰り返し種別ごとに必要な項目を検証する（画面定義書02 §4）。
 * 種別に関係しない項目は null に落として保存する（週次を月次に変えた際の残骸を防ぐ）
 */
export function validateRoutineInput(
  input: RoutineInput
): Result<ValidRoutineInput, RoutineError> {
  const name = validateName(input.name);
  if (!name.ok) return name;

  // 見積もりは必須（画面定義書02 §4）。0分は「未設定」であり展開後に見積もりのないタスクになる
  if (!Number.isSafeInteger(input.estimateMinutes) || input.estimateMinutes <= 0) {
    return err("invalid_estimate");
  }

  const scheduledStartTime = normalizeStartTime(input.scheduledStartTime);
  if (!isValidStartTime(scheduledStartTime)) return err("invalid_start_time");

  if (!isValidLogicalDate(input.startDate)) return err("invalid_start_date");
  if (input.endDate !== null && input.endDate !== "") {
    if (!isValidLogicalDate(input.endDate)) return err("invalid_end_date");
    if (input.endDate < input.startDate) return err("end_date_before_start_date");
  }
  const endDate = input.endDate === null || input.endDate === "" ? null : input.endDate;

  const recurrence = validateRecurrence(input);
  if (!recurrence.ok) return recurrence;

  return ok({
    name: name.value,
    estimateMinutes: input.estimateMinutes,
    scheduledStartTime,
    modeId: input.modeId,
    projectId: input.projectId,
    recurrenceType: input.recurrenceType,
    ...recurrence.value,
    startDate: input.startDate,
    endDate,
  });
}

type RecurrenceFields = Readonly<{
  weekdays: number | null;
  monthDay: number | null;
  intervalDays: number | null;
}>;

function validateRecurrence(input: RoutineInput): Result<RecurrenceFields, RoutineError> {
  switch (input.recurrenceType) {
    case "daily":
      return ok({ weekdays: null, monthDay: null, intervalDays: null });

    case "weekly":
      // 曜日は1つ以上必須（画面定義書02 §4）
      if (input.weekdays === null || input.weekdays === 0) return err("weekdays_required");
      return ok({ weekdays: input.weekdays, monthDay: null, intervalDays: null });

    case "monthly":
      if (
        input.monthDay === null ||
        !Number.isSafeInteger(input.monthDay) ||
        input.monthDay < 1 ||
        input.monthDay > 31
      ) {
        return err("invalid_month_day");
      }
      return ok({ weekdays: null, monthDay: input.monthDay, intervalDays: null });

    case "interval":
      if (
        input.intervalDays === null ||
        !Number.isSafeInteger(input.intervalDays) ||
        input.intervalDays < 1
      ) {
        return err("invalid_interval_days");
      }
      return ok({ weekdays: null, monthDay: null, intervalDays: input.intervalDays });
  }
}
