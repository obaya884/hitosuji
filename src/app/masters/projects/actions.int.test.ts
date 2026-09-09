// プロジェクト管理の Server Action の**失敗経路**を実DBから直接叩く（T-112）。
// なぜこの段なのか・なぜ失敗経路だけなのかは `(daily)/actions.int.test.ts` の冒頭が正
// （契約はテスト戦略定義書 §6）。**辞書の取り違えは同じ `MASTER_MESSAGES` を
// 引く `masters/sections/actions.int.test.ts` が見るので、ここは合成ルートが動くことを1件見る**
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { createTestDb, MISSING_ID, truncateAll } from "@/infrastructure/db/testing/test-db";

import * as actions from "./actions";

const { db, pool } = createTestDb();

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await pool.end();
});

// ---- 全アクションの網羅（狙いと書き方は `(daily)/actions.int.test.ts` の同じ節が正） ----
// 表を `keyof typeof actions` で受けるので**アクションを1本足すと typecheck が落ちる**。
// 値を引数タプルで持つのは、関数呼び出しを置くと**表の中でキーと呼び出し先を取り違えられる**ため

const FAILURE_ARGS: { [K in keyof typeof actions]: Parameters<(typeof actions)[K]> } = {
  createProjectAction: [{ name: "" }],
  updateProjectAction: [MISSING_ID, { name: "改善" }],
  setProjectArchivedAction: [MISSING_ID, true],
  deleteProjectAction: [MISSING_ID],
};

describe("プロジェクト管理の全アクションが失敗を値として返す（形の規約を全数で確かめる）", () => {
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
