// エラーコード → 画面表示用の日本語メッセージ（表示都合なので presentation に置く）。
// クライアント（daily-board.tsx の入力検証・打刻修正）とサーバ（各 actions.ts）が同じ辞書を参照する（T-49）。
// 置き場は画面配下と共有で分けず、文言辞書はすべてここに集める——同じコードの文言を画面をまたいで
// 流用するため、境界を引くと1つの文言を追うのに複数ファイルを行き来することになる（T-75）。
// ルーチン化を除く各辞書は `Record<エラーコード, string>` で閉じているので、コードを足すと型エラーで
// 気づける（ルーチン化だけ `Partial` にしている理由は当該辞書の doc を参照）
import type { MasterDeletionError } from "@/domain/shared/master-deletion";
import type { PunchEditError } from "@/domain/task/punch-edit";
import type { ModeUsecaseError } from "@/usecases/mode/mode-usecases";
import type { ProjectUsecaseError } from "@/usecases/project/project-usecases";
import type {
  CreateRoutineFromTaskError,
  RoutineUsecaseError,
} from "@/usecases/routine/routine-usecases";
import type { SectionUsecaseError } from "@/usecases/section/section-usecases";
import type { TaskEditUsecaseError } from "@/usecases/task/daily-list-usecases";
import type { TaskOperationError } from "@/usecases/task/operations";
import type { PunchUsecaseError } from "@/usecases/task/punch-usecases";
import type { ReorderUsecaseError } from "@/usecases/task/reorder-usecases";

/** 打刻・並び替え・編集・ルーチン化のいずれでも同じ失敗なので文言も1つ */
const TASK_NOT_FOUND = "タスクが見つかりませんでした";

/**
 * 結果が届かなかったとき（通信断・タイムアウト・サーバ側の異常終了）の文言。
 * エラーコードを持たない唯一の失敗なので辞書ではなく単独の定数（画面定義書00_共通 §4.1）
 */
export const SAVE_FAILED = "保存に失敗しました";

/**
 * 終了 < 開始。クライアントの打刻修正（`PunchEditError`）とサーバの打刻（`PunchError`）の
 * 双方に出るコードで、どう直せばよいかを告げる形に寄せてある（FB-72 ①）
 */
const ENDED_BEFORE_STARTED = "終了時刻は開始時刻より後にしてください";

/**
 * タスク名・見積もり・コメント・モード・プロジェクトの編集（画面定義書01 §3.3・O-5・O-16・§8）。
 * クライアントは入力検証の2コードだけを引き、サーバは対象の不在も引く
 */
export const TASK_EDIT_MESSAGES: Record<TaskEditUsecaseError, string> = {
  name_required: "タスク名を入力してください",
  invalid_estimate: "見積もりは分（0以上の整数）で入力してください",
  task_not_found: TASK_NOT_FOUND,
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
 * ここだけ `OPERATION_MESSAGES` と文言が違う。**`TaskOperationError` を返す操作でこのコードへ
 * 到達するのは `duplicateAndStartTask` だけ**（打刻の完了取り消しも同じコードを返すが、そちらは
 * `PUNCH_MESSAGES` を引く）なので、差をこの辞書に閉じ込めれば共有辞書側は一致を保てる（T-74）。
 *
 * **`duplicateAndStartTaskAction` 以外から引かないこと**。`TaskOperationError ⊇ PunchUsecaseError`
 * なので打刻系のコードを引いても型は通り、そのとき打刻の失敗に「複製して開始…」が出る
 * （T-74 で消したかった症状そのもの）。この1本だけは型でもテストでも守れないため名前で示す
 */
export const DUPLICATE_AND_START_MESSAGES: Record<TaskOperationError, string> = {
  ...OPERATION_MESSAGES,
  not_completed: "複製して開始できるのは完了タスクだけです",
};

/**
 * ルーチン入力の検証エラー。ルーチン管理（画面定義書02 §4）とデイリーのルーチン化
 * （画面定義書01 §4.1）が同じコードを表示する（FB-72 ②）
 */
export const ROUTINE_MESSAGES: Record<RoutineUsecaseError, string> = {
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

/** マスタ管理3種（セクション・モード・プロジェクト）の失敗を1つの型で扱う（表示は `failure()` 経由） */
// ユースケース側の型（`SectionError | "not_found"` 等）を並べる——ドメインのエラー型だけを並べると、
// ユースケースが新しいコードを足しても下の `Record` が型エラーにならず、辞書の穴に気づけない
export type MasterError =
  | SectionUsecaseError
  | ModeUsecaseError
  | ProjectUsecaseError
  | MasterDeletionError;

/**
 * マスタ管理の入力検証・アーカイブ・物理削除（画面定義書03 §3.1 / §3.2 / §4.1）。
 *
 * `ROUTINE_MESSAGES` と `name_required` / `name_too_long` の文言が一致するのは偶然ではなく、
 * どちらも `domain/shared/master-name.ts` の `NameError`（マスタ共通の名前検証）に由来する。
 * それでも**2つの辞書は畳まない**（T-78）——検証規則が同じでも、**どう言うかは画面ごとの裁量**に置く:
 * - 同名の `invalid_start_time` をマスタは「開始時刻」・ルーチンは「開始想定時刻」と**意図的に
 *   違う文言**で出しており、キーで統合すると表示が変わる（＝2辞書は連動しない）
 * - `MasterError` と `RoutineUsecaseError` に包含関係が無いので、辞書を取り違えると**型が弾く**。
 *   共有 const（`TASK_NOT_FOUND` 等）を置いた T-74 の動機＝「包含関係のせいで型が捕まえられない
 *   取り違えを、文言の一致で無害化する」はここには働かない
 */
export const MASTER_MESSAGES: Record<MasterError, string> = {
  name_required: "名前を入力してください",
  name_too_long: "名前は50文字以内で入力してください",
  invalid_start_time: "開始時刻を HH:MM 形式で入力してください",
  duplicate_start_time: "同じ開始時刻の有効なセクションがあります",
  last_active_section: "有効なセクションは最低1件必要です",
  day_start_section: "日界セクションはアーカイブできません（先に別のセクションを日界に指定してください）",
  invalid_color: "色はプリセットから選択してください",
  // 取り直しは §4.1 に従って実装が自動で行うので、文言では手順を指示せず理由だけを伝える
  not_found: "対象が見つかりません（すでに削除されている可能性があります）",
  not_archived: "削除できるのはアーカイブ済みのものだけです",
  // 参照元はマスタごとに違う（画面定義書03 §4.1）ので、種類を挙げずに言い切る
  has_references: "参照しているデータがあるため削除できません",
};

/**
 * ルーチン化の失敗（F-305 / 画面定義書01 §4.1）。ユースケースの `CreateRoutineFromTaskError` は
 * ここに無いコードも型上は許容し、それらは既定文言へ落ちる（内訳は `error-messages.test.ts` の
 * 対応表が正）。文言自体は `ROUTINE_MESSAGES` にあるが、**ルーチン化経路でその文言を
 * 流用してよいか**は表示が変わる＝挙動変更の判断（オーナー判断）が要るため、埋めずに `Partial`
 * で不足を型に残す。対応方針は FB-71 で追跡する（`name_too_long` はタスク名が50文字を超えると
 * 実際に到達する。タスク名は文字数無制限だがルーチン名は50文字までのため）
 */
const ROUTINE_FROM_TASK_MESSAGES: Partial<Record<CreateRoutineFromTaskError, string>> = {
  task_not_found: TASK_NOT_FOUND,
  estimate_required: "見積もりを入力してからルーチン化してください",
  routine_derived_task: "ルーチン由来のタスクはルーチン化できません（ルーチン画面で編集してください）",
  // ルーチン入力の検証エラーはルーチン管理画面と同じ文言を出す（FB-72 ②）
  weekdays_required: ROUTINE_MESSAGES.weekdays_required,
  invalid_week_interval: ROUTINE_MESSAGES.invalid_week_interval,
  invalid_start_time: ROUTINE_MESSAGES.invalid_start_time,
  invalid_interval_days: ROUTINE_MESSAGES.invalid_interval_days,
  invalid_month_day: ROUTINE_MESSAGES.invalid_month_day,
};

/** 上の辞書に無いコードの既定文言（理由を告げられない代わりに失敗自体は伝える） */
const ROUTINE_FROM_TASK_FALLBACK = "ルーチン化に失敗しました";

export function routineFromTaskErrorMessage(error: CreateRoutineFromTaskError): string {
  return ROUTINE_FROM_TASK_MESSAGES[error] ?? ROUTINE_FROM_TASK_FALLBACK;
}

