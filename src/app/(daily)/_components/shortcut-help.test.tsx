import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { hasClass } from "@/app/_testing/dom";
import { SHORTCUTS } from "../_lib/shortcuts";
import { ShortcutHelp } from "./shortcut-help";

/**
 * 一覧の行を「キー列 → 説明列」の対で読む（クラス名ではなく表の構造で取る）。
 * `keyCell` は表記＋由来の**描かれた文字**で、`shortcuts.ts` の `keys`（実キー）とは別物
 */
function rows(container: HTMLElement) {
  return [...container.querySelectorAll("tbody tr")].map((tr) => {
    const cells = tr.querySelectorAll("td");
    return { keyCell: cells[0].textContent ?? "", description: cells[1].textContent ?? "" };
  });
}

// ここが見るのは `_lib/shortcuts.ts` の表を**どう描くか**（1行1キー・表示順・ニーモニックの
// 括弧書き）と、閉じ方。表の中身そのものは `shortcuts.test.ts` が見る。
//
// 由来の**置き場が §6 の条項の要点**（説明側に置くと、説明が折り返す行で由来が行末へ流れる）
// なので、下の2本でキー列・説明列の両側から主張する
describe("ShortcutHelp（画面定義書01 §6: ショートカット一覧を `?` で表示し Esc で閉じる）", () => {
  it("キー列に表記とニーモニック由来を括弧書きで置き、表示順どおりに並べる", () => {
    const { container } = render(<ShortcutHelp onClose={vi.fn()} />);

    // 由来のない行には括弧書きを付けない（表にない由来を創作しない）ことも同時に主張する
    expect(rows(container).map((r) => r.keyCell)).toEqual(
      SHORTCUTS.map(
        (shortcut) =>
          shortcut.label + (shortcut.mnemonic === undefined ? "" : `（${shortcut.mnemonic}）`)
      )
    );
  });

  it("説明列には操作の説明だけを置き、ニーモニック由来を混ぜない", () => {
    const { container } = render(<ShortcutHelp onClose={vi.fn()} />);

    expect(rows(container).map((r) => r.description)).toEqual(
      SHORTCUTS.map((shortcut) => shortcut.description)
    );
  });

  // 上の2本は期待値を実装と同じ連結式から作るので、**書式そのものを変えても緑になる**
  // （`SHORTCUTS` が空でも空配列同士の一致で通る）。代表3行だけ literal で留めて書式を固定する
  it("キー列の書式を代表行で固定する", () => {
    const { container } = render(<ShortcutHelp onClose={vi.fn()} />);
    const keyCells = rows(container).map((r) => r.keyCell);

    expect(keyCells).toContain("G（Go to date）");
    // 3キーのうち由来があるのは末尾の `T` だけなので、括弧書きも1語に留める（§6）
    expect(keyCells).toContain("Shift+H / Shift+L / T（Today）");
    // 由来を持たない行には括弧を付けない
    expect(keyCells).toContain("Enter");
  });

  // §6「キーと同じ行に続けて**薄い字で**添え、由来を持たないキーは何も足さない」。
  // 文字だけを見ていると、薄色を落としても・`div` で改行して積んでも同じ文字列になり緑のままなので、
  // 見た目の条項は要素の側で固定する。**実際に1行に収まるか（幅・折り返し）は jsdom では測れない**
  // ので、そちらは `browser-checker` の実測が受け持つ
  it("由来は薄い字のインライン要素で、キーと同じ行に続ける", () => {
    const { container } = render(<ShortcutHelp onClose={vi.fn()} />);
    const keyCells = [...container.querySelectorAll("tbody tr > td:first-child")];
    const cellOf = (label: string) =>
      keyCells[SHORTCUTS.findIndex((shortcut) => shortcut.label === label)];

    const mnemonic = cellOf("G").querySelector("span");
    expect(mnemonic?.textContent).toBe("（Go to date）");
    expect(hasClass(mnemonic as HTMLElement, "text-ink-muted")).toBe(true);
    // インライン要素であること＝キーと同じ行に続く（ブロックで積むと改行される）
    expect(mnemonic?.tagName).toBe("SPAN");

    // 由来を持たない行には要素そのものを置かない
    expect(cellOf("Enter").querySelector("span")).toBeNull();
  });

  it("Esc で閉じる（00_共通 §2.1）", () => {
    const onClose = vi.fn();
    render(<ShortcutHelp onClose={onClose} />);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("閉じるボタンで閉じる", () => {
    const onClose = vi.fn();
    render(<ShortcutHelp onClose={onClose} />);

    fireEvent.click(screen.getByText("閉じる（Esc）"));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("外側（スクリム）のクリックで閉じるが、パネル内のクリックでは閉じない", () => {
    const onClose = vi.fn();
    const { container } = render(<ShortcutHelp onClose={onClose} />);

    const scrim = container.firstElementChild as HTMLElement;
    const panel = scrim.firstElementChild as HTMLElement;

    fireEvent.click(panel);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.click(scrim);
    expect(onClose).toHaveBeenCalledOnce();
  });
});
