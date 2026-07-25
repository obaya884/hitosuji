import { describe, expect, it } from "vitest";

import { shouldFlipUp } from "./flip-up";

// 実測値を引数で受け取る純関数なので jsdom は不要（ユニット段。アーキテクチャ定義書 §8）。
// 幾何は「高さ 800 のビューポート」で組み、アンカーは高さ 30 の1行を想定する
const VIEWPORT = 800;
const metrics = (anchorTop: number, panelHeight: number, viewportHeight: number = VIEWPORT) =>
  ({
    panelHeight,
    anchorTop,
    anchorBottom: anchorTop + 30,
    viewportHeight,
  }) as const;

describe("shouldFlipUp（画面定義書00_共通 §2.1: 既定は起点の下。下に入りきらず、かつ上の余白の方が広いときだけ上向きに反転する）", () => {
  it("下に入りきるなら下向き（既定）", () => {
    // アンカーは画面上部。下に 670px あり、パネル 200px は収まる
    expect(shouldFlipUp(metrics(100, 200))).toBe(false);
  });

  it("下に入りきるなら、上の余白の方が広くても下向きのまま", () => {
    // アンカーは画面下部（上 700px / 下 70px）だが、パネル 50px は下に収まる
    expect(shouldFlipUp(metrics(700, 50))).toBe(false);
  });

  it("下に入りきらず、上の余白の方が広ければ上向きに反転する", () => {
    // 上 700px / 下 70px にパネル 200px
    expect(shouldFlipUp(metrics(700, 200))).toBe(true);
  });

  it("下に入りきらないが、上の余白の方が狭ければ下向きのまま", () => {
    // 上 40px / 下 730px にパネル 900px（どちらにも入りきらないが下の方が広い）
    expect(shouldFlipUp(metrics(40, 900))).toBe(false);
  });

  it("上下の余白が同じなら下向きのまま（同点は反転しない）", () => {
    // ビューポート 230px・アンカー 100〜130px で上 100px / 下 100px の同点。
    // パネル 200px はどちらにも入りきらないが、反転しても収まらないので下のまま
    expect(shouldFlipUp(metrics(100, 200, 230))).toBe(false);
  });

  it("同点から上の余白が 1px 広くなった時点で反転する", () => {
    // 同じアンカーでビューポートを 1px 詰める（上 100px / 下 99px）
    expect(shouldFlipUp(metrics(100, 200, 229))).toBe(true);
  });

  it("同点から上の余白が 1px 狭くなれば下向きのまま", () => {
    // 同じアンカーでビューポートを 1px 広げる（上 100px / 下 101px）
    expect(shouldFlipUp(metrics(100, 200, 231))).toBe(false);
  });

  it("パネルの高さが下の余白とちょうど同じなら「入りきる」として下向き", () => {
    // 上 700px / 下 70px にパネル 70px
    expect(shouldFlipUp(metrics(700, 70))).toBe(false);
  });

  it("パネルの高さが下の余白を 1px でも超えれば（上が広い前提で）反転する", () => {
    expect(shouldFlipUp(metrics(700, 71))).toBe(true);
  });

  it("アンカーがビューポート下端より下にはみ出していれば上向きに反転する", () => {
    // 下の余白は負になる。上には十分な余白がある
    expect(
      shouldFlipUp({ panelHeight: 200, anchorTop: 810, anchorBottom: 840, viewportHeight: VIEWPORT })
    ).toBe(true);
  });
});
