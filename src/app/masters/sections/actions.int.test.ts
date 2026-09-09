// セクション管理の Server Action の**失敗経路**を実DBから直接叩く（T-112）。
// なぜこの段なのか・なぜ失敗経路だけなのかは `(daily)/actions.int.test.ts` の冒頭が正
// （契約はテスト戦略定義書 §6「何をどの層でテストするか」の Server Action の項）。**文言のリテラルは書かず辞書から引く**。
//
// マスタ3種（セクション・モード・プロジェクト）とバンドルは同じ `MASTER_MESSAGES` を引くので、
// **辞書の取り違えを見るのはここ1か所**。他の3ファイルは合成ルートが動くことだけを1件ずつ見る
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { MASTER_MESSAGES } from "@/app/_lib/error-messages";
import { createTestDb, MISSING_ID, truncateAll } from "@/infrastructure/db/testing/test-db";

import * as actions from "./actions";
import { createSectionAction } from "./actions";

const { db, pool } = createTestDb();


beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await pool.end();
});

describe("セクション管理の Server Action の失敗経路（テスト戦略定義書 §6）", () => {
  // `name_required` は ROUTINE と同文言なので判別できない。**同じキーで文言が意図的に違う**
  // `invalid_start_time`（マスタ「開始時刻」／ルーチン「開始想定時刻」）で引き分けを見る
  it("入力の検証は MASTER の辞書を引く（ルーチンと文言が分かれるコード）", async () => {
    expect(await createSectionAction({ name: "朝", startTime: "9:0" })).toEqual({
      ok: false,
      message: MASTER_MESSAGES.invalid_start_time,
    });
  });
});

// ---- 全アクションの網羅（狙いと書き方は `(daily)/actions.int.test.ts` の同じ節が正） ----
// 表を `keyof typeof actions` で受けるので**アクションを1本足すと typecheck が落ちる**。
// 値を引数タプルで持つのは、関数呼び出しを置くと**表の中でキーと呼び出し先を取り違えられる**ため

const FAILURE_ARGS: { [K in keyof typeof actions]: Parameters<(typeof actions)[K]> } = {
  createSectionAction: [{ name: "", startTime: "09:00" }],
  updateSectionAction: [MISSING_ID, { name: "朝", startTime: "06:00" }],
  archiveSectionAction: [MISSING_ID],
  setDayStartSectionAction: [MISSING_ID],
  restoreSectionAction: [MISSING_ID],
  deleteSectionAction: [MISSING_ID],
};

describe("セクション管理の全アクションが失敗を値として返す（形の規約を全数で確かめる）", () => {
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
