import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { DeleteButton } from "./delete-button";

// 物理削除（F-405）の確認は「モーダルを使わず同じ位置で2段階」（画面定義書03 §4.1）
describe("DeleteButton（画面定義書03 §4.1: 2段階の確認・Undo なし）", () => {
  it("最初は「削除」だけを出す（確認は開いていない）", () => {
    render(<DeleteButton onDelete={vi.fn()} disabled={false} />);

    expect(screen.getByRole("button", { name: "削除" })).not.toBeNull();
    expect(screen.queryByText("本当に削除？")).toBeNull();
  });

  it("「削除」を押すと同じ位置が「本当に削除？ [削除する] [取消]」に切り替わる（モーダルは使わない）", () => {
    render(<DeleteButton onDelete={vi.fn()} disabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(screen.getByText("本当に削除？")).not.toBeNull();
    expect(screen.getByRole("button", { name: "削除する" })).not.toBeNull();
    expect(screen.getByRole("button", { name: "取消" })).not.toBeNull();
    // 1段目のボタンは残らない（同じ位置での差し替えなので二重に出ない）
    expect(screen.queryByRole("button", { name: "削除" })).toBeNull();
  });

  it("1段目では削除しない（確認を開いただけでは実行しない）", () => {
    const onDelete = vi.fn();
    render(<DeleteButton onDelete={onDelete} disabled={false} />);

    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    expect(onDelete).not.toHaveBeenCalled();
  });

  it("「削除する」で削除を実行し、確認表示を閉じる", () => {
    const onDelete = vi.fn();
    render(<DeleteButton onDelete={onDelete} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    fireEvent.click(screen.getByRole("button", { name: "削除する" }));

    expect(onDelete).toHaveBeenCalledOnce();
    expect(screen.queryByText("本当に削除？")).toBeNull();
    expect(screen.getByRole("button", { name: "削除" })).not.toBeNull();
  });

  it("「取消」で削除せずに1段目へ戻る", () => {
    const onDelete = vi.fn();
    render(<DeleteButton onDelete={onDelete} disabled={false} />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    fireEvent.click(screen.getByRole("button", { name: "取消" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "削除" })).not.toBeNull();
  });

  it("保存中（disabled）は「削除する」を押せない（多重送信を防ぐ）", () => {
    const onDelete = vi.fn();
    render(<DeleteButton onDelete={onDelete} disabled />);
    fireEvent.click(screen.getByRole("button", { name: "削除" }));

    const execute = screen.getByRole("button", { name: "削除する" });
    expect(execute).toHaveProperty("disabled", true);

    fireEvent.click(execute);
    expect(onDelete).not.toHaveBeenCalled();
  });
});
