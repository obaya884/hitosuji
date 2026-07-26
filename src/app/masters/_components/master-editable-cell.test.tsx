import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MasterEditableCell } from "./master-editable-cell";

// マスタ管理3表が共有するインライン編集セル（画面定義書03 §4「編集方式」/ 00_共通 §2.3）。
// ここでは部品としての作法を固定し、「何を送るか」の配線は各表のテストが持つ（T-44）
function renderCell(props: Partial<Parameters<typeof MasterEditableCell>[0]> = {}) {
  const handlers = {
    onStartEditing: vi.fn(),
    onCommit: vi.fn<(value: string) => void>(),
    onClose: vi.fn(),
  };
  render(
    <MasterEditableCell
      isEditing={false}
      value="モードA"
      isPending={false}
      {...handlers}
      {...props}
    />
  );
  return handlers;
}

describe("MasterEditableCell（画面定義書03 §4「編集方式」/ 00_共通 §2.3）", () => {
  describe("閉じているとき", () => {
    it("現在値をボタンで出し、押すと編集を始める", () => {
      const { onStartEditing } = renderCell();

      const cell = screen.getByRole("button", { name: "モードA" });
      fireEvent.click(cell);

      expect(onStartEditing).toHaveBeenCalledOnce();
    });

    it("display を渡すと表示だけを差し替える（値は送信・復帰用に別で持つ）", () => {
      renderCell({ value: "06:00", display: "06:00–12:00" });

      expect(screen.getByRole("button", { name: "06:00–12:00" })).not.toBeNull();
    });

    it("編集に入ると入力欄には display ではなく値が入る", () => {
      renderCell({ isEditing: true, value: "06:00", display: "06:00–12:00" });

      expect(screen.getByDisplayValue("06:00")).not.toBeNull();
      expect(screen.queryByDisplayValue("06:00–12:00")).toBeNull();
    });

    // 行内に編集可能なセルが1つしかない表（プロジェクト）も同じ部品を使うため一様に止まる（FB-63）
    it("保存中は押せない（古い値での上書きを防ぐ。§2.3「保存中」）", () => {
      const { onStartEditing } = renderCell({ isPending: true });

      const cell = screen.getByRole("button", { name: "モードA" });
      expect(cell).toHaveProperty("disabled", true);

      fireEvent.click(cell);
      expect(onStartEditing).not.toHaveBeenCalled();
    });
  });

  describe("編集中", () => {
    it("現在値を入れた入力欄になり、そのまま打てるようフォーカスが移る（§4「編集方式」）", () => {
      renderCell({ isEditing: true });

      const input = screen.getByDisplayValue("モードA");
      expect(input.tagName).toBe("INPUT");
      expect(document.activeElement).toBe(input);
      expect(screen.queryByRole("button", { name: "モードA" })).toBeNull();
    });

    it("フォーカスが外れたときに変更を確定する", () => {
      const { onCommit, onClose } = renderCell({ isEditing: true });
      const input = screen.getByDisplayValue("モードA");

      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.blur(input);

      expect(onCommit).toHaveBeenCalledExactlyOnceWith("改名後");
      expect(onClose).not.toHaveBeenCalled();
    });

    it("変更なしの確定は何も送信せず閉じる", () => {
      const { onCommit, onClose } = renderCell({ isEditing: true });

      fireEvent.blur(screen.getByDisplayValue("モードA"));

      expect(onCommit).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledOnce();
    });

    // 確定の経路を blur の1本に保つ（Enter が独自に送ると二重送信になる）
    it("Enter は入力欄を抜けて blur の経路に合流する（送信は1回）", () => {
      const { onCommit } = renderCell({ isEditing: true });
      const input = screen.getByDisplayValue("モードA");

      fireEvent.change(input, { target: { value: "改名後" } });
      fireEvent.keyDown(input, { key: "Enter" });

      expect(onCommit).toHaveBeenCalledExactlyOnceWith("改名後");
    });

    it("Esc は元の値に戻して閉じる（送信しない）", () => {
      const { onCommit, onClose } = renderCell({ isEditing: true });
      const input = screen.getByDisplayValue("モードA");
      fireEvent.change(input, { target: { value: "書きかけ" } });

      fireEvent.keyDown(input, { key: "Escape" });

      expect(onCommit).not.toHaveBeenCalled();
      expect(onClose).toHaveBeenCalledOnce();
      expect((input as HTMLInputElement).value).toBe("モードA");
    });

    it("保存中は開いたままの入力欄からも確定できない（2件目の更新を飛ばさない。§2.3「保存中」）", () => {
      const { onCommit, onClose } = renderCell({ isEditing: true, isPending: true });
      const input = screen.getByDisplayValue("モードA");

      fireEvent.change(input, { target: { value: "さらに改名" } });
      fireEvent.blur(input);
      fireEvent.keyDown(input, { key: "Enter" });

      expect(onCommit).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
    });

    it("保存中は Esc で取消せない（応答を待つ間に閉じると失敗のメッセージだけが残る）", () => {
      const { onClose } = renderCell({ isEditing: true, isPending: true });
      const input = screen.getByDisplayValue("モードA");
      fireEvent.change(input, { target: { value: "書きかけ" } });

      fireEvent.keyDown(input, { key: "Escape" });

      expect(onClose).not.toHaveBeenCalled();
      // 値も元へ戻さない（保存が返ってから続けて直せる）
      expect((input as HTMLInputElement).value).toBe("書きかけ");
    });

    // 判定そのものは keyboard.test.ts が持つ。ここは共通関数を通していることの確認（00_共通 §3）
    it("IME変換中の Enter・Esc は操作として扱わない", () => {
      const { onCommit, onClose } = renderCell({ isEditing: true });
      const input = screen.getByDisplayValue("モードA");
      fireEvent.change(input, { target: { value: "かいめいご" } });

      fireEvent.keyDown(input, { key: "Enter", isComposing: true });
      fireEvent.keyDown(input, { key: "Escape", isComposing: true });

      expect(onCommit).not.toHaveBeenCalled();
      expect(onClose).not.toHaveBeenCalled();
      expect((input as HTMLInputElement).value).toBe("かいめいご");
    });

    it("時刻の列は時刻入力にし、導出値の添え書きを右に並べる", () => {
      renderCell({
        isEditing: true,
        value: "06:00",
        type: "time",
        adornment: <span title="次のセクションの開始時刻から自動導出">–12:00</span>,
      });

      expect(screen.getByDisplayValue("06:00")).toHaveProperty("type", "time");
      const derived = screen.getByTitle("次のセクションの開始時刻から自動導出");
      expect(derived.textContent).toBe("–12:00");
      expect(derived.tagName).not.toBe("INPUT");
    });
  });
});
