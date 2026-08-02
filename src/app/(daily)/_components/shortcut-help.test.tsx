import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { SHORTCUTS } from "../_lib/shortcuts";
import { ShortcutHelp } from "./shortcut-help";

/** 一覧の行を「キー列 → 説明列」の対で読む（クラス名ではなく表の構造で取る） */
function rows(container: HTMLElement) {
  return [...container.querySelectorAll("tbody tr")].map((tr) => {
    const cells = tr.querySelectorAll("td");
    return { keys: cells[0].textContent ?? "", description: cells[1].textContent ?? "" };
  });
}

// ここが見るのは `_lib/shortcuts.ts` の表を**どう描くか**（1行1キー・表示順・ニーモニックの
// 括弧書き）と、閉じ方。表の中身そのものは `shortcuts.test.ts` が見る。
describe("ShortcutHelp（画面定義書01 §6: ショートカット一覧を `?` で表示し Esc で閉じる）", () => {
  it("表の全行を1行ずつ、キー列に表記を置いて表示順どおりに並べる", () => {
    const { container } = render(<ShortcutHelp onClose={vi.fn()} />);

    expect(rows(container).map((r) => r.keys)).toEqual(
      SHORTCUTS.map((shortcut) => shortcut.label)
    );
  });

  it("説明のうしろにニーモニック由来だけを括弧書きで添える（§6「ニーモニック由来を併記する」）", () => {
    const { container } = render(<ShortcutHelp onClose={vi.fn()} />);

    // 由来のない行には括弧書きを付けない（表にない由来を創作しない）ことも同時に主張する
    expect(rows(container).map((r) => r.description)).toEqual(
      SHORTCUTS.map(
        (shortcut) =>
          shortcut.description + (shortcut.mnemonic === undefined ? "" : `（${shortcut.mnemonic}）`)
      )
    );
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
