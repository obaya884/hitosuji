// **すべての `actions.ts` に、全アクションを型で網羅する統合テストが隣にあること**を確かめる（T-112）。
//
// 各 `actions.int.test.ts` の中の網羅表（`Record<keyof typeof actions, …>`）は、そのファイルに
// アクションを足したときに typecheck を落とす。だが**画面を新しく足して `actions.int.test.ts` を
// 作らなければ何も落ちない**——網羅の粒度が1段上がっただけで「規約だけが支える」状態が残る。
// そこを閉じるのがこのテストで、見るのは中身ではなく**存在と、網羅表を持っていること**だけ。
import { existsSync, globSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

/** 画面の Server Action。`_testing/actions.ts`（テスト用の道具）は同名だが対象外 */
const actionFiles = globSync("src/app/**/actions.ts", { cwd: repoRoot }).filter(
  (file) => !file.includes("_testing/")
);

describe("Server Action の網羅（テスト戦略定義書 §6）", () => {
  it("画面の actions.ts を取りこぼしていない（この検査自体が空振りしていないこと）", () => {
    expect(actionFiles.length).toBeGreaterThanOrEqual(6);
  });

  it.each(actionFiles)("%s の隣に、全アクションを型で網羅する統合テストがある", (file) => {
    const test = path.join(repoRoot, file.replace(/actions\.ts$/, "actions.int.test.ts"));

    expect(existsSync(test)).toBe(true);
    // 見るのは**網羅を強制している形そのもの**（マップ型）。`keyof typeof actions` だけを探すと、
    // `Object.keys(...) as (keyof typeof actions)[]` のような**強制しない用法**にも当たってしまう
    expect(readFileSync(test, "utf8")).toContain("[K in keyof typeof actions]");
  });
});
