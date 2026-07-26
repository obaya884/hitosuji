import { describe, expect, it } from "vitest";

import type { RoutineUsecaseError } from "@/usecases/routine/routine-usecases";
import { ROUTINE_ERROR_MESSAGES } from "./routine-error-messages";

/** エラーコード → 画面に出す日本語メッセージの対応（画面定義書02 §4 の入力検証） */
const EXPECTED: Record<RoutineUsecaseError, string> = {
  name_required: "名前を入力してください",
  name_too_long: "名前は50文字以内で入力してください",
  invalid_estimate: "見積もりは1分以上の整数で入力してください",
  invalid_start_time: "開始想定時刻を HH:MM 形式で入力してください",
  invalid_start_date: "開始日を正しく入力してください",
  invalid_end_date: "終了日を正しく入力してください",
  end_date_before_start_date: "終了日は開始日以降にしてください",
  weekdays_required: "曜日を1つ以上選んでください",
  invalid_week_interval: "週間隔は1〜53の整数で入力してください",
  invalid_month_day: "日は1〜31で入力してください",
  invalid_interval_days: "間隔は1日以上で入力してください",
  routine_not_found: "ルーチンが見つかりませんでした",
};

describe("ROUTINE_ERROR_MESSAGES（画面定義書02 §4: ルーチン入力の検証エラーを表示用メッセージへ変換する）", () => {
  it("対応表が期待どおり（コードの過不足も含めて固定する）", () => {
    expect(ROUTINE_ERROR_MESSAGES).toEqual(EXPECTED);
  });
});
