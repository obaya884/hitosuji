import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { hasClass } from "@/app/_testing/dom";
import { MasterTableFrame } from "./master-table-frame";

/**
 * エラー帯（`noticeDanger`）。文言ではなく帯そのものを探すので、
 * 「文言が空のまま帯だけ出る」形の後退も捕まえられる
 */
const errorNotice = (container: HTMLElement) =>
  [...container.querySelectorAll("p")].find((p) => hasClass(p, "bg-danger-weak")) ?? null;

function renderFrame(
  props: Partial<{
    description: ReactNode;
    error: string | null;
    isPending: boolean;
    onAddNew: () => void;
  }> = {}
) {
  return render(
    <MasterTableFrame
      description={props.description ?? "並び順は名前順です。"}
      error={props.error ?? null}
      isPending={props.isPending ?? false}
      onAddNew={props.onAddNew ?? vi.fn()}
    >
      <table>
        <tbody>
          <tr>
            <td>マスタA</td>
          </tr>
        </tbody>
      </table>
    </MasterTableFrame>
  );
}

// マスタ管理3表に共通の外枠（画面定義書03 §3・§4）
describe("MasterTableFrame（画面定義書03: 説明文・新規追加・エラー帯を3表で共通にする）", () => {
  it("説明文と「新規追加」と表の中身を出す", () => {
    renderFrame();

    expect(screen.getByText("並び順は名前順です。")).not.toBeNull();
    expect(screen.getByRole("button", { name: "新規追加" })).not.toBeNull();
    expect(screen.getByText("マスタA")).not.toBeNull();
  });

  it("失敗が無いときはエラー帯を出さない（空の帯を置いて間延びさせない）", () => {
    const { container } = renderFrame({ error: null });

    expect(errorNotice(container)).toBeNull();
  });

  it("失敗のメッセージを受け取ったらエラー帯に出す", () => {
    const { container } = renderFrame({ error: "名前を入力してください" });

    expect(errorNotice(container)?.textContent).toBe("名前を入力してください");
  });

  // 帯は説明行の下・表の上（3表に直書きされていた並びの唯一の持ち主になったので、ここで固定する）
  it("エラー帯は見出し行と表の間に置く", () => {
    const { container } = renderFrame({ error: "名前を入力してください" });
    const notice = errorNotice(container);
    const table = container.querySelector("table");

    expect(notice?.compareDocumentPosition(table as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING
    );
  });

  it("失敗が解消したら帯を消す（次の編集を始めると null が渡る）", () => {
    const { container, rerender } = renderFrame({ error: "名前を入力してください" });
    expect(errorNotice(container)).not.toBeNull();

    rerender(
      <MasterTableFrame description="並び順は名前順です。" error={null} isPending={false} onAddNew={vi.fn()}>
        <table />
      </MasterTableFrame>
    );

    expect(errorNotice(container)).toBeNull();
  });

  // sections は説明文を2行に折った断片で渡す（1つの文字列にすると継ぎ目の空白が消える）
  it("説明文は文字列でも JSX の断片でも受け取れる", () => {
    renderFrame({
      description: (
        <>
          編集できるのは開始時刻だけです。
          先頭のラジオで「1日の開始」になるセクションを選べます。
        </>
      ),
    });

    expect(screen.getByText(/編集できるのは開始時刻だけです。 先頭のラジオで/)).not.toBeNull();
  });

  it("「新規追加」で新規行を開く合図を返す（開くのに要る初期化は表側が持つ）", () => {
    const onAddNew = vi.fn();
    renderFrame({ onAddNew });

    fireEvent.click(screen.getByRole("button", { name: "新規追加" }));

    expect(onAddNew).toHaveBeenCalledOnce();
  });

  it("保存中は「新規追加」を押せない（開いていたセルが閉じてしまう。00_共通 §2.3）", () => {
    const onAddNew = vi.fn();
    renderFrame({ isPending: true, onAddNew });

    const button = screen.getByRole("button", { name: "新規追加" });
    expect(button).toHaveProperty("disabled", true);
    fireEvent.click(button);

    expect(onAddNew).not.toHaveBeenCalled();
  });
});
