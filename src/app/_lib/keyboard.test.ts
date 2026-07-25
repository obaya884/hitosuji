import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { inlineEditKeyHandler } from "./keyboard";

// jsdom を要さない（イベントの形だけを見る純粋関数）ため *.test.ts に置く。
// 画面定義書01 §6: インライン編集は Enter 保存 / Escape 取消、IME変換中は操作として扱わない
describe("inlineEditKeyHandler", () => {
  const fireKey = (
    handler: (e: KeyboardEvent<HTMLInputElement>) => void,
    key: string,
    nativeEvent: Readonly<{ isComposing?: boolean }> = {},
    keyCode = 0
  ) => {
    const input = { value: "入力値" } as HTMLInputElement;
    handler({
      key,
      keyCode,
      nativeEvent: { isComposing: false, ...nativeEvent },
      currentTarget: input,
    } as unknown as KeyboardEvent<HTMLInputElement>);
    return input;
  };

  it("Enter で onEnter に入力欄を渡す", () => {
    const onEnter = vi.fn();
    const handler = inlineEditKeyHandler({ onEnter, onEscape: vi.fn() });

    const input = fireKey(handler, "Enter");

    expect(onEnter).toHaveBeenCalledWith(input);
  });

  it("Escape で onEscape に入力欄を渡す", () => {
    const onEscape = vi.fn();
    const handler = inlineEditKeyHandler({ onEnter: vi.fn(), onEscape });

    const input = fireKey(handler, "Escape");

    expect(onEscape).toHaveBeenCalledWith(input);
  });

  it("他のキーではどちらも呼ばない", () => {
    const onEnter = vi.fn();
    const onEscape = vi.fn();
    const handler = inlineEditKeyHandler({ onEnter, onEscape });

    fireKey(handler, "a");
    fireKey(handler, "Tab");

    expect(onEnter).not.toHaveBeenCalled();
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("IME変換中の Enter は保存しない（日本語入力の変換確定）", () => {
    const onEnter = vi.fn();
    const handler = inlineEditKeyHandler({ onEnter, onEscape: vi.fn() });

    fireKey(handler, "Enter", { isComposing: true });

    expect(onEnter).not.toHaveBeenCalled();
  });

  it("keyCode 229 の Enter は保存しない（isComposing 未対応環境の保険）", () => {
    const onEnter = vi.fn();
    const handler = inlineEditKeyHandler({ onEnter, onEscape: vi.fn() });

    fireKey(handler, "Enter", { isComposing: false }, 229);

    expect(onEnter).not.toHaveBeenCalled();
  });

  it("変換中の Escape も取消として扱わない", () => {
    const onEscape = vi.fn();
    const handler = inlineEditKeyHandler({ onEnter: vi.fn(), onEscape });

    fireKey(handler, "Escape", { isComposing: true });

    expect(onEscape).not.toHaveBeenCalled();
  });
});
