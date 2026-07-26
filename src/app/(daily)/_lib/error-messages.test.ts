import { describe, expect, it } from "vitest";

import type { TaskEditError } from "@/domain/task/edit";
import type { PunchEditError } from "@/domain/task/punch-edit";
import type {
  CreateRoutineFromTaskError,
  RoutineUsecaseError,
} from "@/usecases/routine/routine-usecases";
import type { TaskOperationError } from "@/usecases/task/operations";
import type { PunchUsecaseError } from "@/usecases/task/punch-usecases";
import type { ReorderUsecaseError } from "@/usecases/task/reorder-usecases";
import { ROUTINE_ERROR_MESSAGES } from "@/app/_lib/routine-error-messages";
import {
  OPERATION_MESSAGES,
  PUNCH_EDIT_MESSAGES,
  PUNCH_MESSAGES,
  REORDER_MESSAGES,
  routineFromTaskErrorMessage,
  TASK_EDIT_MESSAGES,
} from "./error-messages";

const EXPECTED_TASK_EDIT: Record<TaskEditError, string> = {
  name_required: "タスク名を入力してください",
  invalid_estimate: "見積もりは分（0以上の整数）で入力してください",
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
};

const EXPECTED_REORDER: Record<ReorderUsecaseError, string> = {
  task_not_found: "タスクが見つかりませんでした",
};

const EXPECTED_OPERATION: Record<TaskOperationError, string> = {
  task_not_found: "タスクが見つかりませんでした",
  already_started: "このタスクはすでに開始済みです",
  not_running: "実行中のタスクではありません",
  ended_before_started: "終了時刻は開始時刻より後にしてください",
  not_postponable: "先送りできるのは未実行タスクだけです",
  // 打刻の "完了したタスクではありません" を複製して開始（F-208）向けに上書きしている
  not_completed: "複製して開始できるのは完了タスクだけです",
};

/** 辞書に無いコードが落ちる既定文言 */
const ROUTINE_FROM_TASK_FALLBACK = "ルーチン化に失敗しました";

/**
 * ルーチン化（F-305 / 画面定義書01 §4.1）。辞書に無いコードは既定文言へ落ちるので、
 * 「どのコードが既定文言のままか」もここで固定する（埋めるかどうかの判断は FB-71）
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
  // ここから下は辞書に無く、理由を告げられないまま既定文言になる（FB-71）
  name_required: ROUTINE_FROM_TASK_FALLBACK,
  name_too_long: ROUTINE_FROM_TASK_FALLBACK,
  invalid_estimate: ROUTINE_FROM_TASK_FALLBACK,
  invalid_start_date: ROUTINE_FROM_TASK_FALLBACK,
  invalid_end_date: ROUTINE_FROM_TASK_FALLBACK,
  end_date_before_start_date: ROUTINE_FROM_TASK_FALLBACK,
  routine_not_found: ROUTINE_FROM_TASK_FALLBACK,
};

describe("デイリー画面のエラー文言辞書（T-49: クライアントとサーバが同じ辞書を参照する）", () => {
  it("タスク編集（§3.3・§8）の対応表が期待どおり", () => {
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

  it("中断・複製・複製して開始・先送り・削除（F-204 / F-111 / F-208 / F-107 / O-8）の対応表が期待どおり", () => {
    expect(OPERATION_MESSAGES).toEqual(EXPECTED_OPERATION);
  });

  it("ルーチン化（F-305 / §4.1）の対応表が期待どおり（辞書に無いコードは既定文言）", () => {
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
   * ルーチン化の辞書に埋めてあるコードのうち、ルーチン管理と共有するものを全走査する。
   * コードを列挙しないので、FB-71 で不足コードを埋めたときも自動でこの不変条件の網に入る
   */
  it("ルーチン入力の検証エラーはルーチン管理画面と同じ（FB-72 ②）", () => {
    const shared = (
      Object.keys(EXPECTED_ROUTINE_FROM_TASK) as CreateRoutineFromTaskError[]
    ).filter(
      (code): code is RoutineUsecaseError =>
        code in ROUTINE_ERROR_MESSAGES &&
        routineFromTaskErrorMessage(code) !== ROUTINE_FROM_TASK_FALLBACK
    );

    expect(shared.length).toBeGreaterThan(0); // 走査が空振りしていないこと
    for (const code of shared) {
      expect(routineFromTaskErrorMessage(code)).toBe(ROUTINE_ERROR_MESSAGES[code]);
    }
  });

  it("task_not_found は打刻・並び替え・ルーチン化で同じ", () => {
    expect(REORDER_MESSAGES.task_not_found).toBe(PUNCH_MESSAGES.task_not_found);
    expect(routineFromTaskErrorMessage("task_not_found")).toBe(PUNCH_MESSAGES.task_not_found);
  });
});
