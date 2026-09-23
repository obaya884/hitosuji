// ルーチン管理の Server Action の**失敗経路**を実DBから直接叩く（T-112）。
// なぜこの段なのか・なぜ失敗経路だけなのかは `(daily)/actions.int.test.ts` の冒頭が正
// （契約はテスト戦略定義書 §6「何をどの層でテストするか」の Server Action の項）。**文言のリテラルは書かず辞書から引く**。
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { ROUTINE_MESSAGES } from "@/app/_lib/error-messages";
import { createTestDb, MISSING_ID, truncateAll } from "@/infrastructure/db/testing/test-db";
import type { RoutineInput } from "@/domain/routine/input";

import * as actions from "./actions";
import { createRoutineAction } from "./actions";

const { db, pool } = createTestDb();

/** 妥当な入力。**1項目だけを崩して**、狙った検証に落ちることを確かめる */
const VALID_INPUT: RoutineInput = {
  name: "朝の支度",
  estimateMinutes: 30,
  modeId: null,
  projectId: null,
  bundleId: null,
  url: "",
  startDate: "2026-07-19",
  endDate: null,
  scheduledStartTime: "09:00",
  recurrenceType: "daily",
  weekdays: null,
  weekInterval: null,
  monthDay: null,
  intervalDays: null,
};

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await pool.end();
});

describe("ルーチン管理の Server Action の失敗経路（テスト戦略定義書 §6）", () => {
  // `name_required` はマスタ管理と同文言なので判別できない。**同じキーで文言が意図的に違う**
  // `invalid_start_time`（ルーチン「開始想定時刻」／マスタ「開始時刻」）で引き分けを見る
  it("入力の検証は ROUTINE の辞書を引く（マスタ管理と文言が分かれるコード）", async () => {
    expect(await createRoutineAction({ ...VALID_INPUT, scheduledStartTime: "9:0" })).toEqual({
      ok: false,
      message: ROUTINE_MESSAGES.invalid_start_time,
    });
  });
});

// ---- 全アクションの網羅（狙いと書き方は `(daily)/actions.int.test.ts` の同じ節が正） ----
// 表を `keyof typeof actions` で受けるので**アクションを1本足すと typecheck が落ちる**。
// 値を引数タプルで持つのは、関数呼び出しを置くと**表の中でキーと呼び出し先を取り違えられる**ため

const FAILURE_ARGS: { [K in keyof typeof actions]: Parameters<(typeof actions)[K]> } = {
  createRoutineAction: [{ ...VALID_INPUT, name: "" }],
  updateRoutineAction: [MISSING_ID, VALID_INPUT],
  setRoutineActiveAction: [MISSING_ID, false],
  deleteRoutineAction: [MISSING_ID],
};

describe("ルーチン管理の全アクションが失敗を値として返す（形の規約を全数で確かめる）", () => {
  const names = Object.keys(FAILURE_ARGS) as (keyof typeof actions)[];

  it.each(names)("%s", async (name) => {
    // 呼び出しの型は表（`Parameters<…>`）が既に検査しているので、ここは可変長で受け直すだけ
    const run = actions[name] as (...args: readonly unknown[]) => Promise<{ ok: boolean }>;

    await expect(run(...FAILURE_ARGS[name])).resolves.toEqual({
      ok: false,
      message: expect.stringMatching(/\S/),
    });
  });
});
