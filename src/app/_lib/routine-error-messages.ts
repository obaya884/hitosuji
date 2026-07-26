// ルーチン入力の検証エラー → 画面表示用の日本語メッセージ（表示都合なので presentation に置く）。
// ルーチン管理（画面定義書02 §4）とデイリーのルーチン化（画面定義書01 §4.1）が同じコードを表示する
// ため、画面ごとではなく画面をまたぐ1本の辞書としてここに置く（T-49 / FB-72）
import type { RoutineUsecaseError } from "@/usecases/routine/routine-usecases";

/**
 * `Record<RoutineUsecaseError, string>` で閉じているので、ドメインへエラーコードを足すと
 * ここが型エラーになる（文言の決め忘れを防ぐ）
 */
export const ROUTINE_ERROR_MESSAGES: Record<RoutineUsecaseError, string> = {
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
