// デイリーの Server Action の**失敗経路**を実DBから直接叩く（T-112）。
// この段を置く理由と線引きはテスト戦略定義書 §6「何をどの層でテストするか」の Server Action の項が正。
//
// **このファイル固有の前提**: 失敗枝を素で呼べるのは、`revalidatePath` が成功枝の内側にあり
// **失敗枝が副作用ゼロ**だから（[T-107](../../../docs/案件/closed_23_技術改善バックログ.md#t-107)）。
// この形が崩れると、ここの全テストが `revalidatePath` の例外で落ち、失敗経路を測れなくなる。
//
// **文言のリテラルは書かず辞書から引く**（辞書を直したときにこちらが古いまま緑になる）。
// ただし `TASK_NOT_FOUND` は5つの辞書が共有する定数なので、**「対象が無い」で辞書は判別できない**——
// 辞書の取り違えを見るテストは、**その辞書にしか無い失敗コード**で書く。
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import {
  OPERATION_MESSAGES,
  routineFromTaskErrorMessage,
  TASK_EDIT_MESSAGES,
  taskActionErrorMessage,
} from "@/app/_lib/error-messages";
import { createTaskRepository } from "@/infrastructure/db/repositories/drizzle-task-repository";
import { createTestDb, MISSING_ID, truncateAll } from "@/infrastructure/db/testing/test-db";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { RoutineFromTaskChoice } from "@/domain/routine/from-task";
import type { TaskId } from "@/domain/task/task";
import type { TaskOperationError } from "@/usecases/task/operations";
import type { PunchUsecaseError } from "@/usecases/task/punch-usecases";
import { addTask } from "@/usecases/task/daily-list-usecases";
import { task } from "@/domain/task/testing/task";
import type { CompletionSnapshot } from "@/usecases/task/punch-usecases";

import * as actions from "./actions";
import {
  createRoutineFromTaskAction,
  duplicateAndStartTaskAction,
  postponeTaskAction,
  updateTaskEstimateAction,
  updateTaskPunchAction,
} from "./actions";

const { db, pool } = createTestDb();
const repo = createTaskRepository(db);

// 統合段は自前の日付で組む（`domain/shared/testing/clock.ts` は「統合テストはここへ寄せていない」と宣言している）
const DATE: LogicalDate = "2026-07-19";
const NOW = new Date("2026-07-19T01:30:00Z"); // JST 10:30

const CHOICE: RoutineFromTaskChoice = {
  scheduledStartTime: "09:00",
  recurrenceType: "daily",
  weekdays: null,
  weekInterval: null,
  monthDay: null,
  intervalDays: null,
};

// 集合の型のまま渡すための恒等関数（`taskActionErrorMessage` の JSDoc が理由を持つ）
const asPunchError = (code: PunchUsecaseError): PunchUsecaseError => code;
const asOperationError = (code: TaskOperationError): TaskOperationError => code;

async function createNotStartedTask(): Promise<TaskId> {
  const created = await addTask(repo, { date: DATE, name: "資料作成" });
  if (!created.ok) throw new Error("前提のタスクを作れませんでした");
  return created.value.id;
}

/** 実行中のタスク。**未実行でないと落ちる失敗**（先送り）を起こすために要る */
async function createRunningTask(): Promise<TaskId> {
  const id = await createNotStartedTask();
  await repo.updatePunch(id, { startedAt: NOW, endedAt: null }, []);
  return id;
}

beforeEach(async () => {
  await truncateAll(db);
});

// 閉じるのは `truncateAll` 用のこの接続だけ。**アクションが使うのは `setup-int.ts` が
// テストDBへ向け直した本番モジュール側のプール**で、そちらは `globalThis` にキャッシュされたまま残る
afterAll(async () => {
  await pool.end();
});

describe("デイリーの Server Action の失敗経路（テスト戦略定義書 §6）", () => {
  // `invalid_estimate` は TASK_EDIT にしか無いコード。**`task_not_found` は5つの辞書が同じ定数を
  // 共有している**ので、そちらで書いても辞書の取り違えは落ちない
  it("編集は TASK_EDIT の辞書を引く（この辞書にしか無い失敗コード）", async () => {
    const id = await createNotStartedTask();

    expect(await updateTaskEstimateAction(id, "３０分")).toEqual({
      ok: false,
      message: TASK_EDIT_MESSAGES.invalid_estimate,
    });
  });

  // 対象は在るが状態が前提と違う経路。**「対象が無い」だけを見ていると、
  // 失敗コードが握り潰されて別のコードに化けても気づけない**
  it("未実行のタスクは打刻を修正できず、その失敗コードの文言が返る", async () => {
    const id = await createNotStartedTask();

    expect(await updateTaskPunchAction(id, { startedAt: NOW, endedAt: null }, "10:30")).toEqual({
      ok: false,
      message: taskActionErrorMessage("updatePunch", asPunchError("not_running")),
    });
  });

  // 対象は在るが状態が前提と違うもう1つの経路。**族の中（先送り・削除・中断…）の取り違えは
  // ここでは判別できない**——同じ辞書を共有しているため。判別できなくても無害であることの
  // 根拠は `_lib/error-messages.test.ts`（共有するコードの文言が一致することの不変条件）
  it("未実行でないタスクは先送りできず、その失敗コードの文言が返る", async () => {
    const id = await createRunningTask();

    expect(await postponeTaskAction(id)).toEqual({
      ok: false,
      message: OPERATION_MESSAGES.not_postponable,
    });
  });

  // 「複製して開始」だけは専用の辞書を持つ（`not_completed` に「もう一回」の文脈を添えるため）。
  // **同じ族の共通辞書へ逸れても型は通る**ので、文言が分かれていることをここで押さえる
  it("複製して開始は専用の辞書を引く（操作の共通辞書へ逸れない）", async () => {
    const id = await createNotStartedTask();

    const result = await duplicateAndStartTaskAction(id, NOW);

    expect(result).toEqual({
      ok: false,
      message: taskActionErrorMessage("duplicateAndStart", asOperationError("not_completed")),
    });
    expect(result).not.toEqual({ ok: false, message: OPERATION_MESSAGES.not_completed });
  });

  // `estimate_required` はルーチン化にしか無いコード。**`task_not_found` で書くと、
  // 5つの辞書が同じ定数を共有しているので取り違えても落ちない**
  it("ルーチン化は専用の辞書を引く（この辞書にしか無い失敗コード）", async () => {
    const id = await createNotStartedTask(); // 見積もりは未設定（0分）のまま

    expect(await createRoutineFromTaskAction(id, CHOICE)).toEqual({
      ok: false,
      message: routineFromTaskErrorMessage("estimate_required"),
    });
  });
});

// ---- 全アクションの網羅（T-107 が実測した「早期 return は全段が緑」の穴を全数で塞ぐ） ----
//
// **表は `keyof typeof actions` で受ける**ので、アクションを1本足すと typecheck が落ちる。
// 足した人は「失敗の起こし方を書く」か「失敗枝が到達不能だと示す」かを選ぶことになり、
// **41本目が黙って穴に落ちる**（規約だけが支える）状態にならない。
//
// **値は引数タプルで持ち、呼ぶのはランナー側**。関数呼び出しをそのまま置くと、直上の行を
// コピペして別のアクションを呼んだままにできてしまい——**表の中に、表が塞ぐはずの穴ができる**。
// タプルなら `Parameters<…>` が各キーの引数を検査するので、取り違えは書けない。
// 個々の文言は上の describe が見るので、ここで見るのは**失敗が値として返ること**だけ。

/**
 * 失敗枝が到達不能なアクション。**引数は渡す**——成功枝へ抜けると `revalidatePath` が
 * リクエストコンテキスト不在で例外を投げるので、「失敗枝を通らなかった」ことを積極的に示せる。
 * 書けば通るだけの逃げ道にしないための形で、**この段が失敗枝だけを見られる前提**
 * （成功枝は素で呼べない）が崩れたときにも、ここが最初に気づく
 */
type NoFailure<A> = Readonly<{ noFailure: A }>;

type FailureArgs = {
  [K in keyof typeof actions]: Parameters<(typeof actions)[K]> | NoFailure<Parameters<(typeof actions)[K]>>;
};

const SNAPSHOT: CompletionSnapshot = {
  taskId: MISSING_ID,
  startedAt: NOW,
  endedAt: NOW,
  sectionId: null,
  sortOrder: 1000,
};

const FAILURE_ARGS: FailureArgs = {
  addTaskAction: [{ date: DATE, name: "" }],
  renameTaskAction: [MISSING_ID, "買い物"],
  updateTaskEstimateAction: [MISSING_ID, "30"],
  updateTaskCommentAction: [MISSING_ID, "メモ"],
  setTaskHighlightAction: [MISSING_ID, true],
  startTaskAction: [MISSING_ID, NOW],
  undoStartAction: [MISSING_ID, NOW],
  undoCompleteAction: [MISSING_ID, NOW],
  restoreCompletionAction: [SNAPSHOT],
  finishTaskAction: [MISSING_ID, NOW],
  updateTaskPunchAction: [MISSING_ID, { startedAt: NOW, endedAt: null }, "10:30"],
  moveTaskByStepAction: [{ taskId: MISSING_ID, date: DATE, step: 1 }],
  setTaskModeAction: [MISSING_ID, null],
  setTaskProjectAction: [MISSING_ID, null],
  setTaskSectionAction: [{ taskId: MISSING_ID, date: DATE, sectionId: null }],
  suspendTaskAction: [MISSING_ID, NOW],
  duplicateTaskAction: [MISSING_ID],
  duplicateAndStartTaskAction: [MISSING_ID, NOW],
  createRoutineFromTaskAction: [MISSING_ID, CHOICE],
  postponeTaskAction: [MISSING_ID],
  deleteTaskAction: [MISSING_ID],
  // 復元は消した行をそのまま書き戻すだけで、失敗する条件が無い（`operations.ts` の `restoreTask`）。
  // `else` 枝は形の規約（アーキテクチャ定義書 §4）を満たすためだけに在り、到達しない
  restoreTaskAction: { noFailure: [task({ id: MISSING_ID, name: "片付け", taskDate: DATE })] },
};

describe("デイリーの全アクションが失敗を値として返す（形の規約を全数で確かめる）", () => {
  const names = Object.keys(FAILURE_ARGS) as (keyof typeof actions)[];

  it.each(names)("%s", async (name) => {
    const entry = FAILURE_ARGS[name];
    // 呼び出しの型は表（`Parameters<…>`）が既に検査しているので、ここは可変長で受け直すだけ
    const run = actions[name] as (...args: readonly unknown[]) => Promise<{ ok: boolean }>;

    if (!Array.isArray(entry)) {
      await expect(run(...entry.noFailure)).rejects.toThrow();
      return;
    }
    // 文言は空でないこと（`failure("")` に退化しても値としては返ってしまう）
    await expect(run(...entry)).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/\S/),
    });
  });
});
