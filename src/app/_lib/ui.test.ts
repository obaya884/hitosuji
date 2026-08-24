import { describe, expect, it } from "vitest";

import * as ui from "./ui";

import {
  btnPrimary,
  btnSecondary,
  disabledPermanent,
  inputBase,
  linkAccent,
  linkDanger,
  linkMuted,
  noticeDanger,
} from "./ui";

/**
 * 名前の接頭辞で対象を引く（`link*` = 語のリンク / `btn*` = 面のボタン）。手書きの一覧に
 * すると**新しく足した定数が検査から漏れる**——「定数を足すときに条項から外れないよう
 * 固定する」という下の describe の目的そのものが空振りするため、定義側から導く。
 */
const constantsNamed = (prefix: string): [string, string][] =>
  Object.entries<string>(ui)
    .filter(([name, value]) => name.startsWith(prefix) && typeof value === "string")
    .map(([name, value]) => [name, value]);

const wordLinks = constantsNamed("link");
const surfaceButtons = constantsNamed("btn");

/**
 * 部品が自分の文字サイズを持っていることを固定する（画面定義書00_共通 §1.1「対象外」）。
 *
 * 部品は本文の3段（主/従/メタ）の外側にあるので、サイズを本文から継承させると
 * 置かれた場所によって同じ部品の大小が変わる。実際、表から `text-sm` を落とした際に
 * サイズを持たない部品（リンク・入力欄）が主段へ引き上がる退行が起きた（FB-91）。
 *
 * サイズの「値」ではなく「自分で持っていること」を見る——値は §1.1 の段の割り当てが
 * 変われば動くが、部品が自分で持つという規則は動かないため。
 *
 * ここだけ手書きなのは、**サイズを持たない定数がある**ため（`floatPanel` は面の見た目だけ、
 * `disabledPermanent` は濃さだけ）。接頭辞では引けないので対象を数え上げる。
 */
describe("ui のクラス定数（画面定義書00_共通 §1.1: 対象外の部品は自分のサイズを自分で持つ）", () => {
  it.each([
    ["btnPrimary", btnPrimary],
    ["btnSecondary", btnSecondary],
    ["linkAccent", linkAccent],
    ["linkMuted", linkMuted],
    ["linkDanger", linkDanger],
    ["inputBase", inputBase],
    ["noticeDanger", noticeDanger],
  ])("%s は文字サイズを自分で持つ", (_name, className) => {
    expect(className.split(" ")).toContainEqual(expect.stringMatching(/^text-(xs|sm|base|lg)$/));
  });
});

/**
 * ホバーの合図と無効の見せ方を固定する（画面定義書00_共通 §2.5）。
 *
 * クラスの「値」ではなく条項が定めた**組み合わせ**を見る——値は配色が変われば動くが、
 * 「下線と色変化を混ぜない」「保存中は合図だけ消す」という規則は動かないため。
 */
describe("ui のクラス定数（画面定義書00_共通 §2.5: 押せること・押せないことの示し方）", () => {
  it.each(wordLinks)("%s は語のリンクなので、ホバーで下線を出し文字色は変えない", (_n, cls) => {
    const tokens = cls.split(" ");
    expect(tokens).toContain("hover:underline");
    expect(tokens).not.toContainEqual(expect.stringMatching(/^hover:text-/));
  });

  it.each(wordLinks)("%s は保存中の無効でホバーの合図だけを消し、濃淡は変えない", (_n, cls) => {
    const tokens = cls.split(" ");
    expect(tokens).toContain("disabled:no-underline");
    expect(tokens).not.toContainEqual(expect.stringMatching(/^disabled:(opacity-|text-)/));
  });

  it.each(surfaceButtons)("%s は面なので背景で合図を出し、保存中はその地色へ戻す", (_n, cls) => {
    const tokens = cls.split(" ");
    // 戻し先は「元の地色」でなければ意味がないので、定数自身の `bg-*` から期待値を組む
    const base = tokens.find((token) => token.startsWith("bg-"));
    expect(base).toBeDefined();
    expect(tokens).toContainEqual(expect.stringMatching(/^hover:bg-/));
    expect(tokens).toContain(`disabled:hover:${base}`);
  });

  it.each(surfaceButtons)("%s は面なので下線を出さず、保存中も濃淡を変えない", (_n, cls) => {
    const tokens = cls.split(" ");
    expect(tokens).not.toContain("hover:underline");
    expect(tokens).not.toContainEqual(expect.stringMatching(/^disabled:(opacity-|text-)/));
  });

  it("恒久的な無効は不透明度だけで表す（文字色を流用せず、擬似クラスにも載せない）", () => {
    expect(disabledPermanent).toMatch(/^opacity-\d+$/);
  });
});
