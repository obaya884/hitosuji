// エラーコード → 画面表示用の日本語メッセージ（表示都合なので presentation に置く）。
// クライアント（daily-board.tsx の入力検証・打刻修正）とサーバ（各 actions.ts）が同じ辞書を参照する（T-49）。
// 置き場は画面配下と共有で分けず、文言辞書はすべてここに集める——同じコードの文言を画面をまたいで
// 流用するため、境界を引くと1つの文言を追うのに複数ファイルを行き来することになる（T-75）。
// 各辞書は `Record<エラーコード, string>` で閉じているので、コードを足すと型エラーで気づける。
// 共有／専用の切り分けと2辞書を畳まない判断の経緯は、技術改善バックログの `log_` / `closed_`
// （T-74 / T-76 / T-78）にある
import type { MasterDeletionError } from "@/domain/shared/master-deletion";
import type { PunchEditError } from "@/domain/task/punch-edit";
import type { ModeUsecaseError } from "@/usecases/mode/mode-usecases";
import type { ProjectUsecaseError } from "@/usecases/project/project-usecases";
import type {
  AddRoutineToBundleError,
  CreateRoutineFromTaskError,
  RemoveRoutineFromBundleError,
  RoutineUsecaseError,
  SetRoutineScheduledStartTimeError,
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

/**
 * 打刻とその取り消し（F-201 / F-210 / F-212 / F-203）。
 * **アクションからは直接引かず `taskActionErrorMessage` を通す**。
 * **本番の呼び出し元は同ファイル内の表だけで、公開しているのはテストが走査するため**
 * （打刻と操作で共有するコードの文言が一致することの検査）
 */
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
  future_time: "現在時刻までの時刻を入力してください",
};

/** 並び替え・セクション割り当て（O-6 / O-5） */
export const REORDER_MESSAGES: Record<ReorderUsecaseError, string> = {
  task_not_found: TASK_NOT_FOUND,
};

/**
 * 中断・複製・先送り・削除（F-204 / F-111 / F-107 / O-8）。
 * `TaskOperationError ⊇ PunchUsecaseError` なので `PUNCH_MESSAGES` を広げた形になるが、
 * **共有するコードの文言は打刻と完全に一致させる**（一致は `error-messages.test.ts` の不変条件
 * テストが守る）。「複製して開始」だけが違う文言を出すため、その差は下の専用辞書へ隔離してある。
 * **アクションからは直接引かず `taskActionErrorMessage` を通す**。公開の理由も `PUNCH_MESSAGES` と同じ
 * （本番の呼び出し元は同ファイル内の表だけで、テストが走査するための公開）
 */
export const OPERATION_MESSAGES: Record<TaskOperationError, string> = {
  ...PUNCH_MESSAGES,
  not_postponable: "先送りできるのは未実行タスクだけです",
};

/**
 * 複製して開始（F-208）専用。`not_completed`（複製元が完了でない）に「もう一回」の文脈を添えるため、
 * **ここだけ `OPERATION_MESSAGES` と文言が違う**。
 *
 * **エクスポートしない**——外から届かなくして、行き着く道を下の表の1行だけにする。
 * 非公開でテストから走査できないぶん、余計なキーが増えていないことは上の `Record<…>` 注釈が見る
 */
const DUPLICATE_AND_START_MESSAGES: Record<TaskOperationError, string> = {
  ...OPERATION_MESSAGES,
  not_completed: "複製して開始できるのは完了タスクだけです",
};

/**
 * 打刻・タスク操作の各アクションが引く辞書の表（T-76）。**キーは `(daily)/actions.ts` の
 * アクションと 1:1**（`start` = `startTaskAction`）で、辞書の選択はここ1か所に集める。
 *
 * 打刻系と操作系のまたぎは下の `TaskActionKindFor` が型で弾くが、**同じ族の中の取り違え**
 * （`suspend` が `duplicateAndStart` を指す等）は失敗コードの型が同じなので見分けられない。
 * この表の行き先は `error-messages.test.ts` の走査が見ており、族内の誤りはそちらで落ちる
 */
const TASK_ACTION_MESSAGE_DICTS = {
  start: PUNCH_MESSAGES,
  undoStart: PUNCH_MESSAGES,
  finish: PUNCH_MESSAGES,
  undoComplete: PUNCH_MESSAGES,
  restoreCompletion: PUNCH_MESSAGES,
  updatePunch: PUNCH_MESSAGES,
  suspend: OPERATION_MESSAGES,
  duplicate: OPERATION_MESSAGES,
  postpone: OPERATION_MESSAGES,
  delete: OPERATION_MESSAGES,
  restore: OPERATION_MESSAGES,
  duplicateAndStart: DUPLICATE_AND_START_MESSAGES,
} as const;

type TaskActionMessageDicts = typeof TASK_ACTION_MESSAGE_DICTS;

/** 表のキー＝打刻・タスク操作のアクション種別 */
export type TaskActionKind = keyof TaskActionMessageDicts;

/**
 * 種別の一覧。**本番の呼び出し元は無く、公開しているのはテストが走査するため**
 * （アクションと辞書の対応表に取り違えが無いことの検査。辞書そのものは非公開のまま）
 */
export const TASK_ACTION_KINDS = Object.keys(
  TASK_ACTION_MESSAGE_DICTS
) as readonly TaskActionKind[];

/** `A` と `B` が同じ集合か。包含だと通ってしまうので双方向で見る（T-76） */
type SameSet<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;

/**
 * 失敗コードの集合 `E` を渡してよい種別。**辞書のキー集合が `E` と一致するものだけ**を許す。
 * 打刻の失敗（`PunchUsecaseError`）で `duplicateAndStart` を指すと、辞書のキー（`TaskOperationError`）
 * のほうが広いので弾かれる——包含のせいで単なる `keyof` では通ってしまう、その向きを閉じるための一致
 */
type TaskActionKindFor<E extends TaskOperationError> = {
  [K in TaskActionKind]: SameSet<keyof TaskActionMessageDicts[K], E> extends true ? K : never;
}[TaskActionKind];

/**
 * 操作種別と失敗コードから表示文言を引く。**ユースケースが返す失敗コードの型をそのまま渡すこと**
 * （`result.error`）。手前の分岐でコードを絞ってしまうと一致判定に掛からず、`kind` 側に
 * 「型 never に代入できない」と出る——そのときは集合の型で受け直した値を渡す
 * （`error-messages.test.ts` の `asPunchError()` と同じ手）
 */
export function taskActionErrorMessage<E extends TaskOperationError>(
  // `TaskActionKind` との交差は添字を通すためだけのもの（絞り込みは右側の一致判定が行う）
  kind: TaskActionKind & TaskActionKindFor<E>,
  error: E
): string {
  const messages: Readonly<Record<string, string>> = TASK_ACTION_MESSAGE_DICTS[kind];
  return messages[error];
}

/**
 * ルーチン入力の検証エラー。ルーチン管理（画面定義書02 §4）とデイリーのルーチン化
 * （画面定義書01 §4.1）が同じコードを表示する（FB-72 ②）
 */
export const ROUTINE_MESSAGES: Record<RoutineUsecaseError, string> = {
  name_required: "名前を入力してください",
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
 * `ROUTINE_MESSAGES` と `name_required` の文言が一致するのは偶然ではなく、
 * どちらも `domain/shared/master-name.ts` の `NameError`（マスタ共通の名前検証）に由来する。
 * それでも**2つの辞書は畳まない**——検証規則が同じでも、**どう言うかは画面ごとの裁量**に置く。
 * 同名の `invalid_start_time` をマスタは「開始時刻」・ルーチンは「開始想定時刻」と**意図的に
 * 違う文言**で出しており、キーで統合すると表示が変わる
 */
export const MASTER_MESSAGES: Record<MasterError, string> = {
  name_required: "名前を入力してください",
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
 * バンドルのメンバー出し入れ・開始想定時刻の編集（画面定義書05 §4 O-5〜O-7 / §6）。
 * `not_found` はマスタ管理と同じ「対象が見つかりません」を、`invalid_start_time` は
 * **ルーチン管理（S-02）と同じ文言**を引く（画面定義書05 §6「検証の規則も文言も S-02 と同じにする」）。
 * `already_in_bundle` はこの操作だけの専用コード
 */
export type BundleMemberError =
  | AddRoutineToBundleError
  | RemoveRoutineFromBundleError
  | SetRoutineScheduledStartTimeError;

export const BUNDLE_MEMBER_MESSAGES: Record<BundleMemberError, string> = {
  not_found: MASTER_MESSAGES.not_found,
  already_in_bundle: "このルーチンは別のバンドルに入っています（一覧を取り直してください）",
  invalid_start_time: ROUTINE_MESSAGES.invalid_start_time,
};

/**
 * ルーチン化の失敗（F-305 / 画面定義書01 §4.1）。**全コードに文言がある**——
 * ユースケースの `CreateRoutineFromTaskError` が実際に起こる失敗だけを持つ型になったため、
 * 既定文言へ落ちる経路そのものが無い（FB-71）。コードが増えたらここが型エラーになる
 */
const ROUTINE_FROM_TASK_MESSAGES: Record<CreateRoutineFromTaskError, string> = {
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

export function routineFromTaskErrorMessage(error: CreateRoutineFromTaskError): string {
  return ROUTINE_FROM_TASK_MESSAGES[error];
}

