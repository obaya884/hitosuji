import { describe, expect, it, vi } from "vitest";

import { assertNoConsoleError, drainConsoleErrors, expectConsoleError } from "./console-guard";

// 網そのもののテスト（T-111）。**`.tsx` に置いてコンポーネント段へ入れるのが要点**——
// `setup.ts` が敷いた配線ごと確かめられる（ここが緑なら、この段の `console.error` は
// 確かに記録されている）。テスト戦略定義書 §10 の言う「怠っても緑のまま」が、この仕掛け
// 自身にも当てはまるため。
//
// 各テストは**出した記録を自分で回収して終わる**（残すと `setup.ts` の afterEach が投げる）
describe("console-guard（テスト戦略定義書 §4: console.error をテスト失敗にする）", () => {
  it("setup が敷いた記録に console.error が届き、あれば投げる", () => {
    console.error("プローブ");

    expect(() => assertNoConsoleError()).toThrow("プローブ");
  });

  it("投げた後は記録を空にする（無関係な後続テストへ赤を伝播させない）", () => {
    console.error("プローブ");
    expect(() => assertNoConsoleError()).toThrow();

    expect(() => assertNoConsoleError()).not.toThrow();
  });

  it("記録が無ければ投げない", () => {
    expect(() => assertNoConsoleError()).not.toThrow();
  });

  it("`%s` を実引数で埋め、足りない分はそのまま残す", () => {
    console.error("An update to %s inside %s", "TaskRow");

    expect(() => assertNoConsoleError()).toThrow("An update to TaskRow inside %s");
  });

  it("値の `$&` を壊さず、余った実引数は末尾に並べる", () => {
    console.error("component: %s", "Task$&Row", "at DailyBoard");

    expect(() => assertNoConsoleError()).toThrow("component: Task$&Row at DailyBoard");
  });

  it("先頭が文字列でなければそのまま並べる", () => {
    console.error({ code: 1 }, "boom");

    expect(() => assertNoConsoleError()).toThrow("[object Object] boom");
  });

  it("expectConsoleError は一致した記録だけを抜き取る（紛れ込んだ act 警告は残る）", () => {
    console.error("Server Action の呼び出しに失敗しました");
    console.error("An update to TaskRow inside a test was not wrapped in act(...)");

    expectConsoleError("呼び出しに失敗");

    expect(() => assertNoConsoleError()).toThrow("not wrapped in act");
  });

  it("2件以上あればすべてメッセージに載せる（片方だけ報告して片方を隠さない）", () => {
    console.error("1件目");
    console.error("2件目");

    expect(() => assertNoConsoleError()).toThrow(/1件目[\s\S]*2件目/);
  });

  it("drainConsoleErrors は記録を返して空にする（投げない）", () => {
    console.error("回収される");

    expect(drainConsoleErrors()).toEqual(["回収される"]);
    expect(drainConsoleErrors()).toEqual([]);
  });

  it("expectConsoleError は正規表現でも受けられる", () => {
    console.error("Server Action の呼び出しに失敗しました");

    expectConsoleError(/呼び出しに(失敗|成功)/);

    expect(() => assertNoConsoleError()).not.toThrow();
  });

  // `test` で照合すると `lastIndex` が持ち越されて2件目を取りこぼし、抜いたつもりの記録が残る
  it("expectConsoleError は `g` 付きの正規表現でも取りこぼさない", () => {
    console.error("プローブ");
    console.error("プローブ");

    expectConsoleError(/プローブ/g);

    expect(() => assertNoConsoleError()).not.toThrow();
  });

  it("expectConsoleError は一致した記録を全件抜き取る（同じ文言が複数出た場合）", () => {
    console.error("同じ文言");
    console.error("同じ文言");

    expectConsoleError("同じ文言");

    expect(() => assertNoConsoleError()).not.toThrow();
  });

  it("expectConsoleError は一致する記録が無ければ投げる（黙って通さない）", () => {
    expect(() => expectConsoleError("出ていないログ")).toThrow("出力されていません");
  });

  // 網の**外側**を主張する。広げたつもりが広がっていない／狭めたつもりが漏れている、を
  // 黙って通さないために置く（範囲は console-guard.ts の冒頭が正）。
  // jsdom の未実装 API の通知（`Not implemented: ...`）も網の外だが、**主張すると
  // その1行が毎回 stderr に残る**ので、こちらは冒頭コメントの記述に委ねる
  it("`console.warn` は網の外（落とすのは console.error だけ）", () => {
    console.warn("警告は素通りする");

    expect(() => assertNoConsoleError()).not.toThrow();
  });

  // この2本は**対で1つの主張**（実行順に依存する）。戻し忘れた spy を次のテストへ引きずると、
  // 1本の抑制がそのファイルの以降の網を静かに落とすため、テストごとに敷き直せているかを見る
  it("戻さない spy を張ったテストは記録に届かない（逃げ道が効く・対の前半）", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    console.error("飲まれるので記録に残らない");
  });

  it("前のテストが戻さなかった spy は引きずらない（対の後半）", () => {
    console.error("プローブ");

    expect(() => assertNoConsoleError()).toThrow("プローブ");
  });
});
