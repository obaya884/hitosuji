import { describe, expect, it } from "vitest";

import { assertNoConsoleError } from "./console-guard";

// ブラウザ段でも網が掛かっていることを主張する（T-111）。`setup-browser.ts` は `./setup` を
// import するだけなので配線は静的に見えるが、**jsdom で成り立つことが実ブラウザでも成り立つ
// 保証は無い**（vitest 自身がコンソールを端末へ転送する層を持つ）。段の前提そのものなので、
// 幾何を測るわけではないがこの段に最小限だけ置く（テスト戦略定義書 §3）。
//
// 網の中身（整形・逃げ道・範囲）は jsdom 側の ./console-guard.test.tsx が持つ
describe("console-guard（ブラウザ段にも setup 経由で網が掛かる）", () => {
  it("console.error が記録され、assertNoConsoleError が投げる", () => {
    console.error("プローブ");

    expect(() => assertNoConsoleError()).toThrow("プローブ");
  });

  it("記録が無ければ投げない", () => {
    expect(() => assertNoConsoleError()).not.toThrow();
  });
});
