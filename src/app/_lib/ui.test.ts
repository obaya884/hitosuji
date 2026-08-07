import { describe, expect, it } from "vitest";

import {
  btnPrimary,
  btnSecondary,
  inputBase,
  linkAccent,
  linkDanger,
  linkMuted,
  noticeDanger,
} from "./ui";

/**
 * 部品が自分の文字サイズを持っていることを固定する（画面定義書00_共通 §1.1「対象外」）。
 *
 * 部品は本文の3段（主/従/メタ）の外側にあるので、サイズを本文から継承させると
 * 置かれた場所によって同じ部品の大小が変わる。実際、表から `text-sm` を落とした際に
 * サイズを持たない部品（リンク・入力欄）が主段へ引き上がる退行が起きた（FB-91）。
 *
 * サイズの「値」ではなく「自分で持っていること」を見る——値は §1.1 の段の割り当てが
 * 変われば動くが、部品が自分で持つという規則は動かないため。
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
