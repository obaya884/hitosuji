import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { disabledPermanent } from "@/app/_lib/ui";
import { hasClass } from "@/app/_testing/dom";
import { RowMenu, type RowMenuItem } from "./row-menu";

/** メニューを開いた状態にして、パネル内の項目ボタンを返す */
function openMenu(items: readonly RowMenuItem[]) {
  render(<RowMenu items={items} />);
  fireEvent.click(screen.getByLabelText("行メニュー"));
}

afterEach(() => {
  vi.restoreAllMocks();
});

// 先送り（O-7）・打刻済み削除の確認（O-8）の入口。閉じ方は 00_共通 §2.1
describe("RowMenu（画面定義書01 O-7/O-8: 行メニューから先送り・削除を実行する）", () => {
  it("既定では閉じていて、ボタンで開閉する", () => {
    const items = [{ label: "複製", onSelect: vi.fn() }];
    render(<RowMenu items={items} />);

    expect(screen.queryByText("複製")).toBeNull();

    fireEvent.click(screen.getByLabelText("行メニュー"));
    expect(screen.queryByText("複製")).not.toBeNull();

    fireEvent.click(screen.getByLabelText("行メニュー"));
    expect(screen.queryByText("複製")).toBeNull();
  });

  it("項目を選ぶと onSelect が呼ばれ、メニューは閉じる", () => {
    const onSelect = vi.fn();
    openMenu([{ label: "翌日へ先送り", onSelect }]);

    fireEvent.click(screen.getByText("翌日へ先送り"));

    expect(onSelect).toHaveBeenCalledOnce();
    expect(screen.queryByText("翌日へ先送り")).toBeNull();
  });

  // 行のクリックは選択を動かす（§5）。項目のクリックが行まで届くと、操作が動かした選択
  // （削除・先送りの送り先。§5）を行の側が上書きしてしまう
  it("項目のクリックは外側へ伝播しない", () => {
    const onOutsideClick = vi.fn();
    render(
      <div onClick={onOutsideClick}>
        <RowMenu items={[{ label: "削除", onSelect: vi.fn() }]} />
      </div>
    );
    fireEvent.click(screen.getByLabelText("行メニュー"));
    expect(onOutsideClick).toHaveBeenCalledOnce(); // 開くクリックは伝播する（これが行を選ぶ）
    onOutsideClick.mockClear();

    fireEvent.click(screen.getByText("削除"));

    expect(onOutsideClick).not.toHaveBeenCalled();
  });

  it("非活性の項目は見せるが押せない（§4.1 / FB-30: 操作の存在は分かるようにする）", () => {
    const onSelect = vi.fn();
    openMenu([{ label: "ルーチン化", onSelect, disabled: true }]);

    const item = screen.getByText("ルーチン化");
    expect((item as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(item);
    expect(onSelect).not.toHaveBeenCalled();
  });

  // 行メニューの無効はすべて恒久的（ルーチン由来はルーチン化不可・中断は実行中のみ 等）と
  // 見て薄くしている。保存中由来の項目が混ざると、この前提ごと条項違反になる（00_共通 §2.5）
  it("非活性の項目だけを薄くする（恒久的な無効。00_共通 §2.5）", () => {
    const onSelect = vi.fn();
    openMenu([
      { label: "ルーチン化", onSelect, disabled: true },
      { label: "複製", onSelect },
    ]);

    expect(hasClass(screen.getByText("ルーチン化"), disabledPermanent)).toBe(true);
    expect(hasClass(screen.getByText("複製"), disabledPermanent)).toBe(false);
  });

  it("確認付きの項目は承認したときだけ実行する（O-8: 打刻済みの削除）", () => {
    const onSelect = vi.fn();
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    openMenu([{ label: "削除", onSelect, confirmMessage: "「朝食」は打刻済みです。削除しますか？" }]);

    fireEvent.click(screen.getByText("削除"));

    expect(confirm).toHaveBeenCalledWith("「朝食」は打刻済みです。削除しますか？");
    expect(onSelect).toHaveBeenCalledOnce();
  });

  it("確認を却下したら実行せず、メニューも開いたまま残す", () => {
    const onSelect = vi.fn();
    vi.spyOn(window, "confirm").mockReturnValue(false);
    openMenu([{ label: "削除", onSelect, confirmMessage: "削除しますか？" }]);

    fireEvent.click(screen.getByText("削除"));

    expect(onSelect).not.toHaveBeenCalled();
    // 選び直せるように閉じない
    expect(screen.queryByText("削除")).not.toBeNull();
  });

  it("外側のクリックで閉じる（00_共通 §2.1）", () => {
    openMenu([{ label: "複製", onSelect: vi.fn() }]);

    fireEvent.mouseDown(document.body);

    expect(screen.queryByText("複製")).toBeNull();
  });

  it("Esc で閉じる（00_共通 §2.1）", () => {
    openMenu([{ label: "複製", onSelect: vi.fn() }]);

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByText("複製")).toBeNull();
  });

  // メニューは常時マウントで、閉じている間は購読しない（`enabled: open`）。ただし
  // 「購読していないこと」自体は DOM から観測できない——購読していても閉じたままなら
  // 見た目は同じため。段2で確かめられるのは購読の付け外しが壊れていないことまでで、
  // リスナ登録の有無そのものは実装依存になるので見ない（古典学派。テスト戦略定義書 §1）
  it("外側クリックで閉じたあとも、もう一度開ける", () => {
    openMenu([{ label: "複製", onSelect: vi.fn() }]);

    fireEvent.mouseDown(document.body);
    expect(screen.queryByText("複製")).toBeNull();

    fireEvent.click(screen.getByLabelText("行メニュー"));
    expect(screen.queryByText("複製")).not.toBeNull();
  });
});
