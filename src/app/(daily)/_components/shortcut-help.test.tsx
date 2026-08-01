import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShortcutHelp } from "./shortcut-help";

/** 一覧の行を「キー列 → 説明列」の対で読む（クラス名ではなく表の構造で取る） */
function rows(container: HTMLElement) {
  return [...container.querySelectorAll("tbody tr")].map((tr) => {
    const cells = tr.querySelectorAll("td");
    return { keys: cells[0].textContent ?? "", description: cells[1].textContent ?? "" };
  });
}

// 画面定義書01 §6 の本表が正。ここは「表の内容がそのまま一覧に出るか」と閉じ方を見る
describe("ShortcutHelp（画面定義書01 §6: ショートカット一覧を `?` で表示し Esc で閉じる）", () => {
  it("§6 の全キー（18行）を1行ずつ並べる", () => {
    const { container } = render(<ShortcutHelp onClose={vi.fn()} />);

    const listed = rows(container);
    // 行数を固定して、キーの追加・削除が仕様表と一緒に更新されることを担保する
    expect(listed).toHaveLength(19);
    expect(listed.map((r) => r.keys)).toEqual([
      "J / K",
      "N",
      "Enter",
      "I",
      "A",
      "R / F2",
      "E",
      "B / F",
      "M",
      "P",
      "S",
      "C",
      "Shift+J / Shift+K",
      "Y",
      "D",
      "U",
      "Shift+H / Shift+L / T",
      "G",
      "?",
    ]);
    // 説明が空の行を作らない（キーだけ並べても何ができるか分からない）
    expect(listed.every((r) => r.description.length > 0)).toBe(true);
  });

  it("ニーモニック由来を併記する（§6「`?` のヘルプ一覧には各キーのニーモニック由来を併記する」）", () => {
    const { container } = render(<ShortcutHelp onClose={vi.fn()} />);

    const byKey = new Map(rows(container).map((r) => [r.keys, r.description]));
    expect(byKey.get("N")).toContain("（Now）");
    expect(byKey.get("C")).toContain("（Comment）");
    expect(byKey.get("A")).toContain("（Add）");
    expect(byKey.get("B / F")).toContain("（Begin / Finish）");
    expect(byKey.get("U")).toContain("（Undo）");
    expect(byKey.get("G")).toContain("（Go to date）");
    // 由来のないキーには括弧書きを付けない（表にない由来を創作しない）
    expect(byKey.get("J / K")).not.toContain("（");
    expect(byKey.get("D")).not.toContain("（");
  });

  it("先送りにショートカットが無い旨を添える（§6「先送りとルーチン化にはショートカットを割り当てない」）", () => {
    render(<ShortcutHelp onClose={vi.fn()} />);

    expect(screen.queryByText(/先送りは誤操作を防ぐためショートカットを割り当てていません/)).not.toBeNull();
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
