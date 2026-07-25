import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Toast } from "./toast";

// 画面定義書01 §8: Undo付き・完了通知は5秒、エラーは8秒で自動消去。閉じるボタンでも消せる（FB-15）
describe("Toast", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("メッセージを表示する", () => {
    render(<Toast message="タスクを削除しました" onClose={vi.fn()} />);

    expect(screen.getByText("タスクを削除しました")).toBeDefined();
  });

  it("undo は5秒で自動消去する", () => {
    const onClose = vi.fn();
    render(<Toast message="削除しました" variant="undo" onClose={onClose} />);

    vi.advanceTimersByTime(4999);
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("info も5秒で自動消去する", () => {
    const onClose = vi.fn();
    render(<Toast message="保存しました" variant="info" onClose={onClose} />);

    vi.advanceTimersByTime(5000);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("error は8秒で自動消去する（失敗は読む時間を長く取る）", () => {
    const onClose = vi.fn();
    render(<Toast message="保存に失敗しました" variant="error" onClose={onClose} />);

    vi.advanceTimersByTime(5000);
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(3000);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("error は地色で区別する", () => {
    const { container } = render(
      <Toast message="失敗しました" variant="error" onClose={vi.fn()} />
    );

    expect(container.querySelector(".bg-danger")).not.toBeNull();
    expect(container.querySelector(".bg-ink")).toBeNull();
  });

  it("閉じるボタンで消せる", () => {
    const onClose = vi.fn();
    render(<Toast message="削除しました" onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("閉じる"));

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("アクションを添えるとラベルが出て押すと呼ばれる", () => {
    const onAction = vi.fn();
    render(
      <Toast message="削除しました" actionLabel="取り消す" onAction={onAction} onClose={vi.fn()} />
    );

    fireEvent.click(screen.getByText("取り消す"));

    expect(onAction).toHaveBeenCalledOnce();
  });

  it("actionLabel が無ければアクションのボタンは出さない（閉じるだけ）", () => {
    render(<Toast message="保存しました" onClose={vi.fn()} />);

    expect(screen.getAllByRole("button")).toHaveLength(1);
  });

  it("アンマウントでタイマーを解放する", () => {
    const onClose = vi.fn();
    const { unmount } = render(<Toast message="削除しました" onClose={onClose} />);

    unmount();
    vi.advanceTimersByTime(10_000);

    expect(onClose).not.toHaveBeenCalled();
  });
});
