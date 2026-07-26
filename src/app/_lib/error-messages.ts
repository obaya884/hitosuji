// エラーコード → 画面表示用の日本語メッセージ（表示都合なので presentation に置く）。
// クライアント（daily-board.tsx の入力検証・打刻修正）とサーバ（各 actions.ts）が同じ辞書を参照する（T-49）。
// 置き場は画面配下と共有で分けず、文言辞書はすべてここに集める——同じコードの文言を画面をまたいで
// 流用するため、境界を引くと1つの文言を追うのに複数ファイルを行き来することになる（T-75）。
// ルーチン化を除く各辞書は `Record<エラーコード, string>` で閉じているので、コードを足すと型エラーで
// 気づける（ルーチン化だけ `Partial` にしている理由は当該辞書の doc を参照）
import type { TaskEditError } from "@/domain/task/edit";
import type { PunchEditError } from "@/domain/task/punch-edit";
import type {
  CreateRoutineFromTaskError,
  RoutineUsecaseError,
} from "@/usecases/routine/routine-usecases";
import type { TaskOperationError } from "@/usecases/task/operations";
import type { PunchUsecaseError } from "@/usecases/task/punch-usecases";
import type { ReorderUsecaseError } from "@/usecases/task/reorder-usecases";

/** 打刻・並び替え・ルーチン化のいずれでも同じ失敗なので文言も1つ */
const TASK_NOT_FOUND = "タスクが見つかりませんでした";

/**
 * 終了 < 開始。クライアントの打刻修正（`PunchEditError`）とサーバの打刻（`PunchError`）の
 * 双方に出るコードで、どう直せばよいかを告げる形に寄せてある（FB-72 ①）
 */
const ENDED_BEFORE_STARTED = "終了時刻は開始時刻より後にしてください";

/** タスク名・見積もりのインライン編集（画面定義書01 §3.3・§8） */
export const TASK_EDIT_MESSAGES: Record<TaskEditError, string> = {
  name_required: "タスク名を入力してください",
  invalid_estimate: "見積もりは分（0以上の整数）で入力してください",
};

/** 打刻とその取り消し（F-201 / F-210 / F-212 / F-203） */
export const PUNCH_MESSAGES: Record<PunchUsecaseError, string> = {
  task_not_found: TASK_NOT_FOUND,
  already_started: "このタスクはすでに開始済みです",
  not_running: "実行中のタスクではありません",
  not_completed: "完了したタスクではありません",
  ended_before_started: ENDED_BEFORE_STARTED,
};

/** 打刻時刻のインライン修正（F-203）。HH:MM の解釈はクライアントで済ませるのでサーバでは発生しない */
export const PUNCH_EDIT_MESSAGES: Record<PunchEditError, string> = {
  invalid_time: "時刻は HH:MM 形式で入力してください",
  not_punched: "打刻されていないため修正できません",
  no_started_at: "開始時刻のないタスクに終了時刻は設定できません",
  ended_before_started: ENDED_BEFORE_STARTED,
};

/** 並び替え・セクション割り当て（O-6 / O-5） */
export const REORDER_MESSAGES: Record<ReorderUsecaseError, string> = {
  task_not_found: TASK_NOT_FOUND,
};

/**
 * 中断・複製・先送り・削除（F-204 / F-111 / F-107 / O-8）。
 * `TaskOperationError ⊇ PunchUsecaseError` なので `PUNCH_MESSAGES` を広げた形になるが、
 * **共有するコードの文言は打刻と完全に一致させる**——一致していれば辞書を取り違えても表示は変わらず、
 * 型でも捕まらない取り違えが誤りでなくなる（T-74）。「複製して開始」だけが違う文言を出すため、
 * その差は下の専用辞書へ隔離した。一致は `error-messages.test.ts` の不変条件テストが守る
 */
export const OPERATION_MESSAGES: Record<TaskOperationError, string> = {
  ...PUNCH_MESSAGES,
  not_postponable: "先送りできるのは未実行タスクだけです",
};

/**
 * 複製して開始（F-208）専用。`not_completed`（複製元が完了でない）に「もう一回」の文脈を添えるため、
 * ここだけ `OPERATION_MESSAGES` と文言が違う。**このコードへ到達するのは
 * `duplicateAndStartTask` だけ**なので、差をこの辞書に閉じ込めれば共有辞書側は一致を保てる（T-74）
 */
export const DUPLICATE_AND_START_MESSAGES: Record<TaskOperationError, string> = {
  ...OPERATION_MESSAGES,
  not_completed: "複製して開始できるのは完了タスクだけです",
};

/**
 * ルーチン入力の検証エラー。ルーチン管理（画面定義書02 §4）とデイリーのルーチン化
 * （画面定義書01 §4.1）が同じコードを表示する（FB-72 ②）。
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

/**
 * ルーチン化の失敗（F-305 / 画面定義書01 §4.1）。ユースケースの `CreateRoutineFromTaskError` は
 * ここに無いコードも型上は許容し、それらは既定文言へ落ちる（内訳は `error-messages.test.ts` の
 * 対応表が正）。文言自体は `ROUTINE_ERROR_MESSAGES` にあるが、**ルーチン化経路でその文言を
 * 流用してよいか**は表示が変わる＝挙動変更の判断（オーナー判断）が要るため、埋めずに `Partial`
 * で不足を型に残す。対応方針は FB-71 で追跡する（`name_too_long` はタスク名が50文字を超えると
 * 実際に到達する。タスク名は文字数無制限だがルーチン名は50文字までのため）
 */
const ROUTINE_FROM_TASK_MESSAGES: Partial<Record<CreateRoutineFromTaskError, string>> = {
  task_not_found: TASK_NOT_FOUND,
  estimate_required: "見積もりを入力してからルーチン化してください",
  routine_derived_task: "ルーチン由来のタスクはルーチン化できません（ルーチン画面で編集してください）",
  // ルーチン入力の検証エラーはルーチン管理画面と同じ文言を出す（FB-72 ②）
  weekdays_required: ROUTINE_ERROR_MESSAGES.weekdays_required,
  invalid_week_interval: ROUTINE_ERROR_MESSAGES.invalid_week_interval,
  invalid_start_time: ROUTINE_ERROR_MESSAGES.invalid_start_time,
  invalid_interval_days: ROUTINE_ERROR_MESSAGES.invalid_interval_days,
  invalid_month_day: ROUTINE_ERROR_MESSAGES.invalid_month_day,
};

/** 上の辞書に無いコードの既定文言（理由を告げられない代わりに失敗自体は伝える） */
const ROUTINE_FROM_TASK_FALLBACK = "ルーチン化に失敗しました";

export function routineFromTaskErrorMessage(error: CreateRoutineFromTaskError): string {
  return ROUTINE_FROM_TASK_MESSAGES[error] ?? ROUTINE_FROM_TASK_FALLBACK;
}
