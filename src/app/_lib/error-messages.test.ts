import { describe, expect, it } from "vitest";

import type { PunchEditError } from "@/domain/task/punch-edit";
import type {
  CreateRoutineFromTaskError,
  RoutineUsecaseError,
} from "@/usecases/routine/routine-usecases";
import type { TaskEditUsecaseError } from "@/usecases/task/daily-list-usecases";
import type { TaskOperationError } from "@/usecases/task/operations";
import type { PunchUsecaseError } from "@/usecases/task/punch-usecases";
import type { ReorderUsecaseError } from "@/usecases/task/reorder-usecases";
import {
  MASTER_MESSAGES,
  type MasterError,
  OPERATION_MESSAGES,
  PUNCH_EDIT_MESSAGES,
  PUNCH_MESSAGES,
  REORDER_MESSAGES,
  ROUTINE_MESSAGES,
  routineFromTaskErrorMessage,
  SAVE_FAILED,
  TASK_EDIT_MESSAGES,
  type TaskActionKind,
  TASK_ACTION_KINDS,
  taskActionErrorMessage,
} from "./error-messages";

const EXPECTED_TASK_EDIT: Record<TaskEditUsecaseError, string> = {
  name_required: "タスク名を入力してください",
  invalid_estimate: "見積もりは分（0以上の整数）で入力してください",
  task_not_found: "タスクが見つかりませんでした",
};

const EXPECTED_PUNCH: Record<PunchUsecaseError, string> = {
  task_not_found: "タスクが見つかりませんでした",
  already_started: "このタスクはすでに開始済みです",
  not_running: "実行中のタスクではありません",
  not_completed: "完了したタスクではありません",
  ended_before_started: "終了時刻は開始時刻より後にしてください",
};

const EXPECTED_PUNCH_EDIT: Record<PunchEditError, string> = {
  invalid_time: "時刻は HH:MM 形式で入力してください",
  not_punched: "打刻されていないため修正できません",
  no_started_at: "開始時刻のないタスクに終了時刻は設定できません",
  ended_before_started: "終了時刻は開始時刻より後にしてください",
  future_time: "現在時刻までの時刻を入力してください",
};

const EXPECTED_REORDER: Record<ReorderUsecaseError, string> = {
  task_not_found: "タスクが見つかりませんでした",
};

const EXPECTED_OPERATION: Record<TaskOperationError, string> = {
  task_not_found: "タスクが見つかりませんでした",
  already_started: "このタスクはすでに開始済みです",
  not_running: "実行中のタスクではありません",
  not_completed: "完了したタスクではありません",
  ended_before_started: "終了時刻は開始時刻より後にしてください",
  not_postponable: "先送りできるのは未実行タスクだけです",
};

/** 複製して開始（F-208）だけは not_completed に「もう一回」の文脈を添える（T-74） */
const EXPECTED_DUPLICATE_AND_START: Record<TaskOperationError, string> = {
  ...EXPECTED_OPERATION,
  not_completed: "複製して開始できるのは完了タスクだけです",
};

/** 打刻系のアクション（ユースケースが `PunchUsecaseError` を返す）。名前は `(daily)/actions.ts` と 1:1 */
const PUNCH_ACTION_KINDS = [
  "start",
  "undoStart",
  "finish",
  "undoComplete",
  "restoreCompletion",
  "updatePunch",
] as const;

/** 操作系のアクション（ユースケースが `TaskOperationError` を返す） */
const OPERATION_ACTION_KINDS = [
  "suspend",
  "duplicate",
  "postpone",
  "delete",
  "restore",
  "duplicateAndStart",
] as const;

/**
 * 操作種別ごとに引かれるべき辞書（T-76）。打刻系と操作系は共有コードの文言が一致する（T-74）ので、
 * この表が実際に見分けるのは**専用辞書へ迷い込んでいないか**——`not_completed` がそこだけ違う
 */
const EXPECTED_PUNCH_ACTION_DICTS: Record<
  (typeof PUNCH_ACTION_KINDS)[number],
  Record<PunchUsecaseError, string>
> = {
  start: EXPECTED_PUNCH,
  undoStart: EXPECTED_PUNCH,
  finish: EXPECTED_PUNCH,
  undoComplete: EXPECTED_PUNCH,
  restoreCompletion: EXPECTED_PUNCH,
  updatePunch: EXPECTED_PUNCH,
};

const EXPECTED_OPERATION_ACTION_DICTS: Record<
  (typeof OPERATION_ACTION_KINDS)[number],
  Record<TaskOperationError, string>
> = {
  suspend: EXPECTED_OPERATION,
  duplicate: EXPECTED_OPERATION,
  postpone: EXPECTED_OPERATION,
  delete: EXPECTED_OPERATION,
  restore: EXPECTED_OPERATION,
  duplicateAndStart: EXPECTED_DUPLICATE_AND_START,
};

/** 上の2つで全種別を覆うことを型で押さえる（種別が増えたらどちらかに足さないと型エラー） */
const EXPECTED_ACTION_DICTS: Record<TaskActionKind, Readonly<Record<string, string>>> = {
  ...EXPECTED_PUNCH_ACTION_DICTS,
  ...EXPECTED_OPERATION_ACTION_DICTS,
};

/** 集合の型のまま渡すための恒等関数（変数に入れるとコード1つへ絞られ、種別の一致判定に掛からない） */
const asPunchError = (code: PunchUsecaseError): PunchUsecaseError => code;
const asOperationError = (code: TaskOperationError): TaskOperationError => code;

/** ルーチン管理の入力検証（画面定義書02 §4） */
const EXPECTED_ROUTINE: Record<RoutineUsecaseError, string> = {
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

/**
 * ルーチン化（F-305 / 画面定義書01 §4.1）。**全コードに文言がある**——既定文言へ落ちる
 * 経路は無い（FB-71 で型を実際に起こる失敗だけに絞った）
 */
const EXPECTED_ROUTINE_FROM_TASK: Record<CreateRoutineFromTaskError, string> = {
  task_not_found: "タスクが見つかりませんでした",
  estimate_required: "見積もりを入力してからルーチン化してください",
  routine_derived_task:
    "ルーチン由来のタスクはルーチン化できません（ルーチン画面で編集してください）",
  weekdays_required: "曜日を1つ以上選んでください",
  invalid_week_interval: "週間隔は1〜53の整数で入力してください",
  invalid_start_time: "開始想定時刻を HH:MM 形式で入力してください",
  invalid_interval_days: "間隔は1日以上で入力してください",
  invalid_month_day: "日は1〜31で入力してください",
};

/**
 * マスタ管理（画面定義書03 §3.1 のバリデーション・§3.2 の色プリセット・§4.1 の物理削除）。
 * `Record<MasterError, string>` にしているので、ドメインへエラーコードを足したらこのテストが
 * 型エラーで落ちる（文言の決め忘れを防ぐ）
 */
const EXPECTED_MASTER: Record<MasterError, string> = {
  name_required: "名前を入力してください",
  invalid_start_time: "開始時刻を HH:MM 形式で入力してください",
  duplicate_start_time: "同じ開始時刻の有効なセクションがあります",
  last_active_section: "有効なセクションは最低1件必要です",
  day_start_section:
    "日界セクションはアーカイブできません（先に別のセクションを日界に指定してください）",
  invalid_color: "色はプリセットから選択してください",
  not_found: "対象が見つかりません（すでに削除されている可能性があります）",
  not_archived: "削除できるのはアーカイブ済みのものだけです",
  has_references: "参照しているデータがあるため削除できません",
};

describe("エラー文言辞書（T-49: クライアントとサーバが同じ辞書を参照する）", () => {
  it("タスク編集（画面定義書01 §3.3・同書 §8）の対応表が期待どおり", () => {
    expect(TASK_EDIT_MESSAGES).toEqual(EXPECTED_TASK_EDIT);
  });

  it("打刻とその取り消し（F-201 / F-203 / F-210 / F-212）の対応表が期待どおり", () => {
    expect(PUNCH_MESSAGES).toEqual(EXPECTED_PUNCH);
  });

  it("打刻修正（F-203）の対応表が期待どおり", () => {
    expect(PUNCH_EDIT_MESSAGES).toEqual(EXPECTED_PUNCH_EDIT);
  });

  it("並び替え・セクション割り当て（O-6 / O-5）の対応表が期待どおり", () => {
    expect(REORDER_MESSAGES).toEqual(EXPECTED_REORDER);
  });

  it("中断・複製・先送り・削除（F-204 / F-111 / F-107 / O-8）の対応表が期待どおり", () => {
    expect(OPERATION_MESSAGES).toEqual(EXPECTED_OPERATION);
  });

  // 複製して開始（F-208）の辞書は非公開なので、対応表は下の「操作種別 → 辞書」の describe が固定する

  it("ルーチン入力の検証（画面定義書02 §4）の対応表が期待どおり（コードの過不足も含めて固定する）", () => {
    expect(ROUTINE_MESSAGES).toEqual(EXPECTED_ROUTINE);
  });

  it("マスタ管理（画面定義書03 §3.1 / 同書 §3.2 / 同書 §4.1）の対応表が期待どおり", () => {
    expect(MASTER_MESSAGES).toEqual(EXPECTED_MASTER);
  });

  it("削除できない理由は参照元の種類（タスク・ルーチン）を挙げずに言い切る（画面定義書03 §4.1）", () => {
    expect(MASTER_MESSAGES.has_references).not.toMatch(/タスク|ルーチン/);
  });

  it("ルーチン化（F-305 / 画面定義書01 §4.1）の対応表が期待どおり（コードの過不足も固定する）", () => {
    for (const [code, message] of Object.entries(EXPECTED_ROUTINE_FROM_TASK) as ReadonlyArray<
      [CreateRoutineFromTaskError, string]
    >) {
      expect(routineFromTaskErrorMessage(code)).toBe(message);
    }
  });
});

describe("同じコードは経路が違っても同じ文言を出す（FB-72: 辞書を分けて写した結果の食い違いを防ぐ）", () => {
  it("ended_before_started はクライアントの打刻修正でもサーバの打刻でも同じ（FB-72 ①）", () => {
    expect(PUNCH_EDIT_MESSAGES.ended_before_started).toBe(PUNCH_MESSAGES.ended_before_started);
  });

  /**
   * ルーチン化とルーチン管理の両方が持つコードを全走査する。
   * コードを列挙しないので、どちらかに新しい共通コードが増えても自動でこの不変条件の網に入る
   */
  it("ルーチン入力の検証エラーはルーチン管理画面と同じ（FB-72 ②）", () => {
    const shared = (
      Object.keys(EXPECTED_ROUTINE_FROM_TASK) as CreateRoutineFromTaskError[]
    ).filter(
      (code): code is CreateRoutineFromTaskError & RoutineUsecaseError => code in ROUTINE_MESSAGES
    );

    expect(shared.length).toBeGreaterThan(0); // 走査が空振りしていないこと
    for (const code of shared) {
      expect(routineFromTaskErrorMessage(code)).toBe(ROUTINE_MESSAGES[code]);
    }
  });

  it("task_not_found は打刻・並び替え・編集・ルーチン化で同じ", () => {
    expect(REORDER_MESSAGES.task_not_found).toBe(PUNCH_MESSAGES.task_not_found);
    expect(TASK_EDIT_MESSAGES.task_not_found).toBe(PUNCH_MESSAGES.task_not_found);
    expect(routineFromTaskErrorMessage("task_not_found")).toBe(PUNCH_MESSAGES.task_not_found);
  });

  // エラーコードを持たない唯一の文言（00_共通 §4.1）。`callAction` が拒否に対して付ける
  it("結果が届かなかったときの文言は「保存に失敗しました」", () => {
    expect(SAVE_FAILED).toBe("保存に失敗しました");
  });

  /**
   * 上の不変条件の**例外**。マスタ管理とルーチン管理は同名コードでも独立した辞書を引き、
   * `invalid_start_time` は意図的に違う文言を出す（T-78: 辞書を畳まない理由そのもの）。
   * 揃えにくると落ちるので、「食い違い」と見て直しにきたときにここで気づける
   */
  it("マスタとルーチンの invalid_start_time は意図的に違う（T-78: 2つの辞書は連動しない）", () => {
    expect(MASTER_MESSAGES.invalid_start_time).not.toBe(ROUTINE_MESSAGES.invalid_start_time);
  });

  /**
   * T-74 の不変条件。`TaskOperationError ⊇ PunchUsecaseError` で型が取り違えを捕まえられないため、
   * 「共有するコードの文言が完全に一致する」ことで取り違えを無害にしている。
   * 差（複製して開始の `not_completed`）を共有辞書へ戻すとこのテストが落ちる
   */
  it("打刻と操作の共有コードは文言が完全に一致する（T-74: 辞書を取り違えても表示が変わらない）", () => {
    const codes = Object.keys(PUNCH_MESSAGES) as PunchUsecaseError[];

    expect(codes.length).toBeGreaterThan(0); // 走査が空振りしていないこと
    for (const code of codes) {
      expect(OPERATION_MESSAGES[code]).toBe(PUNCH_MESSAGES[code]);
    }
  });

  /**
   * 隔離した差が広がっていないこと。専用辞書の存在理由は `not_completed` の1件だけなので、
   * 2件目の上書きが増えたらそれは共有辞書との新しい食い違いであり、隔離の前提が崩れている
   */
  it("複製して開始専用の辞書が共有辞書と違うのは not_completed の1件だけ（T-74）", () => {
    const differing = (Object.keys(OPERATION_MESSAGES) as TaskOperationError[]).filter(
      (code) => taskActionErrorMessage("duplicateAndStart", code) !== OPERATION_MESSAGES[code]
    );

    expect(differing).toEqual(["not_completed"]);
  });
});

/**
 * T-74 が残した最後の穴（T-76）。辞書の選択を `taskActionErrorMessage` へ寄せたので、
 * 行き先の誤りはここと `npm run typecheck` の2つで捕まえる
 */
describe("操作種別 → 辞書の対応表（T-76: 打刻系が複製して開始専用の文言を出さない）", () => {
  it("打刻系の各種別が期待どおりの辞書を引く", () => {
    const codes = Object.keys(EXPECTED_PUNCH) as PunchUsecaseError[];

    expect(codes.length).toBeGreaterThan(0); // 走査が空振りしていないこと
    for (const kind of PUNCH_ACTION_KINDS) {
      for (const code of codes) {
        expect(taskActionErrorMessage(kind, code)).toBe(EXPECTED_PUNCH_ACTION_DICTS[kind][code]);
      }
    }
  });

  it("操作系の各種別が期待どおりの辞書を引く（複製して開始だけ not_completed が違う）", () => {
    const codes = Object.keys(EXPECTED_OPERATION) as TaskOperationError[];

    expect(codes.length).toBeGreaterThan(0);
    for (const kind of OPERATION_ACTION_KINDS) {
      for (const code of codes) {
        expect(taskActionErrorMessage(kind, code)).toBe(
          EXPECTED_OPERATION_ACTION_DICTS[kind][code]
        );
      }
    }
  });

  it("上の2本で実装の全種別を走査している（表に種別が増えると落ちる）", () => {
    // 突き合わせ先は実装の種別一覧。期待値どうしの照合にすると構築上つねに一致して空振りする
    expect([...PUNCH_ACTION_KINDS, ...OPERATION_ACTION_KINDS].sort()).toEqual(
      [...TASK_ACTION_KINDS].sort()
    );
    expect(Object.keys(EXPECTED_ACTION_DICTS).sort()).toEqual([...TASK_ACTION_KINDS].sort());
  });

  /**
   * 型の網そのものを固定する。`@ts-expect-error` は**型エラーが出ないと逆に落ちる**ので、
   * 引数の型を緩める変更（`error` を `TaskOperationError` にする等）はここで `npm run typecheck`
   * が捕まえる（テストファイルの型を見るのは typecheck だけ。テスト戦略定義書 §9）
   */
  it("失敗コードの集合と一致しない種別は渡せない（T-76 の本題）", () => {
    // @ts-expect-error 打刻の失敗で複製して開始の辞書は引けない（T-74 で観測した取り違えそのもの）
    taskActionErrorMessage("duplicateAndStart", asPunchError("not_completed"));
    // @ts-expect-error 操作の失敗で打刻の辞書は引けない（not_postponable の行き先が無い）
    taskActionErrorMessage("start", asOperationError("not_completed"));

    // 一致する組み合わせは通る（上の2本が「何も通らない」ことによる空振りでないこと）
    expect(taskActionErrorMessage("undoComplete", asPunchError("not_completed"))).toBe(
      EXPECTED_PUNCH.not_completed
    );
  });
});
