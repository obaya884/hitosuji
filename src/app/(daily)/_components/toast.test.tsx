import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { Toast } from "./toast";

// 表示時間・閉じ方の正は 00_共通 §2.2（画面定義書01 §8 はそこへ委譲している）
describe("Toast（画面定義書00_共通 §2.2: undo/info は5秒・error は8秒で自動消去、×でも消せる）", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it("メッセージを表示する", () => {
    render(<Toast message="タスクを削除しました" onClose={vi.fn()} />);

    expect(screen.queryByText("タスクを削除しました")).not.toBeNull();
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

  // タイマーはマウント時に1本だけ張る契約（依存配列を空にしている理由）。
  // [variant, onClose] に戻すと再レンダリングごとにタイマーが張り直され表示時間が延びる
  it("再レンダリングしても表示時間は延長されない（初回マウントから通算5秒）", () => {
    const onClose = vi.fn();
    const { rerender } = render(<Toast message="削除しました" onClose={onClose} />);

    vi.advanceTimersByTime(3000);
    // 呼び出し元の再レンダリングを模す（onClose は毎回新しい参照になる）
    rerender(<Toast message="削除しました" onClose={() => onClose()} />);
    vi.advanceTimersByTime(1999);
    expect(onClose).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("アンマウントでタイマーを解放する", () => {
    const onClose = vi.fn();
    const { unmount } = render(<Toast message="削除しました" onClose={onClose} />);

    unmount();
    vi.advanceTimersByTime(10_000);

    expect(onClose).not.toHaveBeenCalled();
  });
});
