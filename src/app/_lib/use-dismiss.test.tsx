import { fireEvent, render, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";

import { useDismiss } from "./use-dismiss";

// 画面定義書 00_共通 §2.1/§3: ポップオーバー等は外側クリックと Escape で閉じる
describe("useDismiss", () => {
  /** ref の中身になる要素を DOM に置き、その ref を返す */
  const renderPanel = () => {
    const ref = createRef<HTMLDivElement>();
    render(
      <div ref={ref} data-testid="panel">
        <button type="button">中の要素</button>
      </div>
    );
    return ref;
  };

  it("外側の mousedown で onClose を呼ぶ", () => {
    const onClose = vi.fn();
    const ref = renderPanel();
    renderHook(() => useDismiss(ref, onClose));

    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("内側の mousedown では呼ばない", () => {
    const onClose = vi.fn();
    const ref = renderPanel();
    renderHook(() => useDismiss(ref, onClose));

    fireEvent.mouseDown(ref.current!.querySelector("button")!);

    expect(onClose).not.toHaveBeenCalled();
  });

  it("Escape で onClose を呼ぶ", () => {
    const onClose = vi.fn();
    const ref = renderPanel();
    renderHook(() => useDismiss(ref, onClose));

    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("Escape 以外のキーでは呼ばない", () => {
    const onClose = vi.fn();
    const ref = renderPanel();
    renderHook(() => useDismiss(ref, onClose));

    fireEvent.keyDown(document, { key: "Enter" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("ref に null を渡すと外側クリックは監視しない（Escape は効く）", () => {
    const onClose = vi.fn();
    renderHook(() => useDismiss(null, onClose));

    fireEvent.mouseDown(document.body);
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("escape: false のとき Escape では閉じない（外側クリックは効く）", () => {
    const onClose = vi.fn();
    const ref = renderPanel();
    renderHook(() => useDismiss(ref, onClose, { escape: false }));

    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).not.toHaveBeenCalled();

    fireEvent.mouseDown(document.body);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("enabled: false のときは何も購読しない", () => {
    const onClose = vi.fn();
    const ref = renderPanel();
    renderHook(() => useDismiss(ref, onClose, { enabled: false }));

    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });

  it("アンマウント後は購読を解除する", () => {
    const onClose = vi.fn();
    const ref = renderPanel();
    const { unmount } = renderHook(() => useDismiss(ref, onClose));

    unmount();
    fireEvent.mouseDown(document.body);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(onClose).not.toHaveBeenCalled();
  });
});
