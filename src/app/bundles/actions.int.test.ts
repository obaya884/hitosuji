// バンドル管理の Server Action の**失敗経路**を実DBから直接叩く（T-112）。
// なぜこの段なのか・なぜ失敗経路だけなのかは `(daily)/actions.int.test.ts` の冒頭が正
// （契約はテスト戦略定義書 §6）。**文言のリテラルは書かず辞書から引く**。
//
// この画面だけ**辞書を2つ引き分ける**——バンドル自身の作成・更新は `MASTER_MESSAGES`、
// メンバーの出し入れ（画面定義書05 §4 O-5〜O-6）は `BUNDLE_MEMBER_MESSAGES`。
// **`not_found` は両方に同じ文言**なので、そちらで書いても引き違えは落ちない。
// しかも `RemoveRoutineFromBundleError` は単一コードなので、**型でも弾けない**——
// `BUNDLE_MEMBER_MESSAGES` にしか無い `already_in_bundle` で見るしかない
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { BUNDLE_MEMBER_MESSAGES } from "@/app/_lib/error-messages";
import { COLOR_BY_NAME } from "@/domain/shared/color-presets";
import { createBundleRepository } from "@/infrastructure/db/repositories/drizzle-bundle-repository";
import { createRoutineRepository } from "@/infrastructure/db/repositories/drizzle-routine-repository";
import { createTestDb, MISSING_ID, truncateAll } from "@/infrastructure/db/testing/test-db";
import type { RoutineInput } from "@/domain/routine/input";

import * as actions from "./actions";
import { setRoutineBundleAction } from "./actions";

const { db, pool } = createTestDb();
const bundles = createBundleRepository(db);
const routines = createRoutineRepository(db);

const ROUTINE: RoutineInput = {
  name: "朝の支度",
  estimateMinutes: 30,
  modeId: null,
  projectId: null,
  bundleId: null,
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

describe("バンドル管理の Server Action の失敗経路（テスト戦略定義書 §6）", () => {
  it("メンバーの出し入れは BUNDLE_MEMBER の辞書を引く（この辞書にしか無い失敗コード）", async () => {
    const first = await bundles.create({ name: "朝の立上げ", color: COLOR_BY_NAME["赤"] });
    const second = await bundles.create({ name: "夜のクローズ", color: COLOR_BY_NAME["青"] });
    const routine = await routines.create({ ...ROUTINE, bundleId: first.id });

    expect(await setRoutineBundleAction(routine.id, second.id)).toEqual({
      ok: false,
      message: BUNDLE_MEMBER_MESSAGES.already_in_bundle,
    });
  });
});

// ---- 全アクションの網羅（狙いと書き方は `(daily)/actions.int.test.ts` の同じ節が正） ----
// 表を `keyof typeof actions` で受けるので**アクションを1本足すと typecheck が落ちる**。
// 値を引数タプルで持つのは、関数呼び出しを置くと**表の中でキーと呼び出し先を取り違えられる**ため

const FAILURE_ARGS: { [K in keyof typeof actions]: Parameters<(typeof actions)[K]> } = {
  createBundleAction: [{ name: "", color: COLOR_BY_NAME["赤"] }],
  updateBundleAction: [MISSING_ID, { name: "夜", color: COLOR_BY_NAME["赤"] }],
  setBundleArchivedAction: [MISSING_ID, true],
  deleteBundleAction: [MISSING_ID],
  setRoutineBundleAction: [MISSING_ID, MISSING_ID],
  removeRoutineFromBundleAction: [MISSING_ID],
};

describe("バンドル管理の全アクションが失敗を値として返す（形の規約を全数で確かめる）", () => {
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
