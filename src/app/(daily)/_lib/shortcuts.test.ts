import { describe, expect, it } from "vitest";

import { SHORTCUTS, SHORTCUT_KEYS } from "./shortcuts";

// **期待値は画面定義書01 §6 から手で写した literal で書く**——表から導くと「表が表と一致する」
// だけの自明なテストになり、写し違いを捉えられない。

describe("SHORTCUTS（画面定義書01 §6 からキー表記・並び・ニーモニックを転記する）", () => {
  it("§6 のキー列を同じ表記・同じ順で持つ", () => {
    expect(SHORTCUTS.map((shortcut) => shortcut.label)).toEqual([
      "J / K",
      "N",
      "Enter",
      "I",
      "A",
      "R",
      "E",
      "B / F",
      "M",
      "P",
      "S",
      "C",
      "H",
      "Shift+J / Shift+K",
      "Y",
      "D",
      "U",
      "Shift+H / Shift+L / T",
      "G",
      "?",
    ]);
  });

  it("§6 本表の括弧書きがある行にだけニーモニックを付ける（同§6「由来を併記する」）", () => {
    const mnemonics = SHORTCUTS.filter((shortcut) => shortcut.mnemonic !== undefined).map(
      (shortcut) => [shortcut.label, shortcut.mnemonic]
    );

    // 由来のある行だけを並べるので、表にない由来を創作していないことも同時に主張する
    expect(mnemonics).toEqual([
      ["N", "Now"],
      ["I", "Interrupt"],
      ["A", "Add"],
      ["R", "Rename"],
      ["E", "Estimate"],
      ["B / F", "Begin / Finish"],
      ["M", "Mode"],
      ["P", "Project"],
      ["S", "Section"],
      ["C", "Comment"],
      ["H", "Highlight"],
      ["Y", "Yank"],
      ["D", "Delete"],
      ["U", "Undo"],
      // 3キーのうち由来があるのは `T` だけ（Shift+H / Shift+L は vim の左右移動から）
      ["Shift+H / Shift+L / T", "Today"],
      ["G", "Go to date"],
    ]);
  });

  it("説明が空の行を作らない（キーだけ並べても何ができるか分からない）", () => {
    expect(SHORTCUTS.filter((shortcut) => shortcut.description === "")).toEqual([]);
  });

  it("同じキーを2つの行に割り当てない（先に来た行が後の行を食う）", () => {
    const seen = SHORTCUT_KEYS.map(({ key, shiftKey }) => `${shiftKey ? "Shift+" : ""}${key}`);

    expect(seen).toEqual([...new Set(seen)]);
  });

  it("キー列の表記が実際のキーを1つ残らず表す（表記だけ足して実キーを落とさない）", () => {
    // 表記が `A / B` 形式の行は実キーもその本数だけ持つ。本数を数えるだけで、
    // どの字面がどのキーかまでは見ない（`Shift+J` → `J` のような読み替えがあるため）
    const counts = SHORTCUTS.map((shortcut) => [shortcut.label, shortcut.keys.length] as const);

    expect(counts).toEqual(
      SHORTCUTS.map((shortcut) => [shortcut.label, shortcut.label.split(" / ").length] as const)
    );
  });
});
