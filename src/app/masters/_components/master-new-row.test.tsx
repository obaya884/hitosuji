import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { MasterNewRow, MasterNewRowInput } from "./master-new-row";

// マスタ管理3表が共有する新規追加行（画面定義書03 §4）。
// ここでは部品としての作法を固定し、「何を送るか」の配線は各表のテストが持つ（T-44）
function renderNewRow(
  props: Partial<{ isPending: boolean }> = {}
): Readonly<{ saved: string[][]; onCancel: () => void }> {
  // onSave は「欄の名前 → 値」を引く関数を受け取る。読めた値を並べて記録する
  const saved: string[][] = [];
  const onCancel = vi.fn();
  render(
    <table>
      <tbody>
        <MasterNewRow
          isPending={props.isPending ?? false}
          onSave={(fieldValue) => saved.push([fieldValue("name"), fieldValue("startTime")])}
          onCancel={onCancel}
          renderCells={(onKeyDown) => (
            <>
              <td>
                <MasterNewRowInput
                  field="name"
                  placeholder="セクション名"
                  autoFocus
                  onKeyDown={onKeyDown}
                />
              </td>
              <td>
                <MasterNewRowInput field="startTime" type="time" onKeyDown={onKeyDown} />
              </td>
            </>
          )}
        />
      </tbody>
    </table>
  );
  return { saved, onCancel };
}

const fillName = (value: string) =>
  fireEvent.change(screen.getByPlaceholderText("セクション名"), { target: { value } });

/** 時刻入力はプレースホルダを持てないので、保存時に読まれる項目名で引く */
const timeInput = (): HTMLInputElement => {
  const input = document.querySelector<HTMLInputElement>('input[data-field="startTime"]');
  if (input === null) throw new Error("開始時刻の入力欄がありません");
  return input;
};

describe("MasterNewRow（画面定義書03 §4: 新規行だけは明示的な保存・取消を置く）", () => {
  it("入力欄は空で始まり、名前欄が最初からフォーカスされる", () => {
    renderNewRow();

    const name = screen.getByPlaceholderText("セクション名");
    expect(name).toHaveProperty("value", "");
    expect(document.activeElement).toBe(name);
  });

  it("「保存」は行の入力欄の値をまとめて渡す（欄の名前で引ける）", () => {
    const { saved } = renderNewRow();
    fillName("新セクション");
    fireEvent.change(timeInput(), { target: { value: "21:00" } });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(saved).toEqual([["新セクション", "21:00"]]);
  });

  it("未入力の欄は空文字として渡す（値の検証はサーバ側が持つ）", () => {
    const { saved } = renderNewRow();

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(saved).toEqual([["", ""]]);
  });

  // プロジェクトのように欄が1つだけの表でも同じ部品を使う（読まれなかった項目は空文字）
  it("行に置いていない欄も空文字として読める", () => {
    const saved: string[][] = [];
    render(
      <table>
        <tbody>
          <MasterNewRow
            isPending={false}
            onSave={(fieldValue) => saved.push([fieldValue("name"), fieldValue("startTime")])}
            onCancel={vi.fn()}
            renderCells={(onKeyDown) => (
              <td>
                <MasterNewRowInput field="name" placeholder="プロジェクト名" onKeyDown={onKeyDown} />
              </td>
            )}
          />
        </tbody>
      </table>
    );
    fireEvent.change(screen.getByPlaceholderText("プロジェクト名"), {
      target: { value: "新プロジェクト" },
    });

    fireEvent.click(screen.getByRole("button", { name: "保存" }));

    expect(saved).toEqual([["新プロジェクト", ""]]);
  });

  it("Enter でも保存する（新規行は blur 経路を通らない）", () => {
    const { saved } = renderNewRow();
    fillName("新セクション");

    fireEvent.keyDown(screen.getByPlaceholderText("セクション名"), { key: "Enter" });

    expect(saved).toEqual([["新セクション", ""]]);
  });

  it("時刻欄の Enter でも保存する（どの欄からでも同じ経路へ入る）", () => {
    const { saved } = renderNewRow();
    fillName("新セクション");

    fireEvent.keyDown(timeInput(), { key: "Enter" });

    expect(saved).toEqual([["新セクション", ""]]);
  });

  it("「取消」で捨てる（保存しない）", () => {
    const { saved, onCancel } = renderNewRow();
    fillName("書きかけ");

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(onCancel).toHaveBeenCalledOnce();
    expect(saved).toEqual([]);
  });

  it("Esc でも捨てる（保存しない）", () => {
    const { saved, onCancel } = renderNewRow();

    fireEvent.keyDown(screen.getByPlaceholderText("セクション名"), { key: "Escape" });

    expect(onCancel).toHaveBeenCalledOnce();
    expect(saved).toEqual([]);
  });

  // 判定そのものは keyboard.test.ts が持つ。ここは共通関数を通していることの確認（00_共通 §3）
  it("IME変換中の Enter・Esc は操作として扱わない", () => {
    const { saved, onCancel } = renderNewRow();
    fillName("しんせくしょん");

    fireEvent.keyDown(screen.getByPlaceholderText("セクション名"), {
      key: "Enter",
      isComposing: true,
    });
    fireEvent.keyDown(screen.getByPlaceholderText("セクション名"), {
      key: "Escape",
      isComposing: true,
    });

    expect(saved).toEqual([]);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("「保存」の押下は入力欄の blur より先に拾う（mousedown の既定動作を抑止して二重送信を防ぐ）", () => {
    renderNewRow();

    // preventDefault されると fireEvent は false を返す（＝入力欄はフォーカスを失わない）
    expect(fireEvent.mouseDown(screen.getByRole("button", { name: "保存" }))).toBe(false);
  });

  // 保存中は確定も取消も止める（00_共通 §2.3「新規追加行の保存中」）
  it("保存中は「保存」を押せない（多重送信を防ぐ）", () => {
    const { saved } = renderNewRow({ isPending: true });

    const save = screen.getByRole("button", { name: "保存" });
    expect(save).toHaveProperty("disabled", true);

    fireEvent.click(save);
    expect(saved).toEqual([]);
  });

  it("保存中は Enter でも保存しない（連打で同じ行が二重に作られるのを防ぐ）", () => {
    const { saved } = renderNewRow({ isPending: true });
    fillName("新セクション");

    fireEvent.keyDown(screen.getByPlaceholderText("セクション名"), { key: "Enter" });
    fireEvent.keyDown(screen.getByPlaceholderText("セクション名"), { key: "Enter" });

    expect(saved).toEqual([]);
  });

  it("保存中は「取消」も Esc も効かない（応答を待つ間に閉じると失敗のメッセージだけが残る）", () => {
    const { onCancel } = renderNewRow({ isPending: true });

    const cancel = screen.getByRole("button", { name: "取消" });
    expect(cancel).toHaveProperty("disabled", true);

    fireEvent.click(cancel);
    fireEvent.keyDown(screen.getByPlaceholderText("セクション名"), { key: "Escape" });

    expect(onCancel).not.toHaveBeenCalled();
  });
});
