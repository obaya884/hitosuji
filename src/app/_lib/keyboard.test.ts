import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import { inlineEditKeyHandler, isPlainKeyEvent, isShortcutEvent } from "./keyboard";

/** 判定に使う項目だけを持つキーイベント（既定は素のキー・フォーカスなし） */
const keyEvent = (
  override: Partial<{
    isComposing: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    target: EventTarget | null;
  }> = {}
) => ({
  isComposing: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  target: null,
  ...override,
});

/** 指定タグの要素にフォーカスがある状態のイベント発生元 */
const focusOn = (tagName: string) => ({ tagName }) as unknown as EventTarget;

// 弾く条件のうち、イベント自体の形だけで決まるもの（オーバーレイ・画面ショートカットに共通）
const BLOCKED_BY_EVENT = [
  ["IME変換中", { isComposing: true }],
  ["Cmd 併用", { metaKey: true }],
  ["Ctrl 併用", { ctrlKey: true }],
  ["Alt 併用", { altKey: true }],
] as const;

describe("isPlainKeyEvent（画面定義書00_共通 §3: IME変換中・修飾キー併用は操作として扱わない）", () => {
  it("素のキーは操作として扱う", () => {
    expect(isPlainKeyEvent(keyEvent())).toBe(true);
  });

  it.each(BLOCKED_BY_EVENT)("%s のキーは操作として扱わない", (_label, override) => {
    expect(isPlainKeyEvent(keyEvent(override))).toBe(false);
  });
});

describe("isShortcutEvent（画面定義書00_共通 §3: 画面全体のショートカットの共通ガード）", () => {
  it("素のキーは操作として扱う", () => {
    expect(isShortcutEvent(keyEvent())).toBe(true);
  });

  it.each(BLOCKED_BY_EVENT)("%s のキーは操作として扱わない", (_label, override) => {
    expect(isShortcutEvent(keyEvent(override))).toBe(false);
  });

  it.each(["INPUT", "TEXTAREA"])(
    "テキスト入力中（%s にフォーカス）は操作として扱わない",
    (tagName) => {
      expect(isShortcutEvent(keyEvent({ target: focusOn(tagName) }))).toBe(false);
    }
  );

  it.each(["BUTTON", "DIV", "BODY"])(
    "入力欄以外（%s）にフォーカスがあるだけでは弾かない",
    (tagName) => {
      expect(isShortcutEvent(keyEvent({ target: focusOn(tagName) }))).toBe(true);
    }
  );

  it("発生元が無い（target が null）キーは操作として扱う", () => {
    expect(isShortcutEvent(keyEvent({ target: null }))).toBe(true);
  });

  it("入力欄にフォーカスがあっても isPlainKeyEvent は弾かない（オーバーレイは入力欄を伴わない）", () => {
    // 2つの関数の差はこの1点だけ。ここが崩れると datepicker・ポップオーバーの挙動が変わる
    expect(isPlainKeyEvent(keyEvent({ target: focusOn("INPUT") }))).toBe(true);
    expect(isShortcutEvent(keyEvent({ target: focusOn("INPUT") }))).toBe(false);
  });
});

// jsdom を要さない（イベントの形だけを見る純粋関数）ため *.test.ts に置く
describe("inlineEditKeyHandler（画面定義書00_共通 §2.3: Enter 保存 / Escape 取消、§3: IME変換中は操作として扱わない）", () => {
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

  it("Enter で onEnter に入力欄を渡す（取消は呼ばない）", () => {
    const onEnter = vi.fn();
    const onEscape = vi.fn();
    const handler = inlineEditKeyHandler({ onEnter, onEscape });

    const input = fireKey(handler, "Enter");

    expect(onEnter).toHaveBeenCalledWith(input);
    expect(onEscape).not.toHaveBeenCalled();
  });

  it("Escape で onEscape に入力欄を渡す（保存は呼ばない）", () => {
    const onEnter = vi.fn();
    const onEscape = vi.fn();
    const handler = inlineEditKeyHandler({ onEnter, onEscape });

    const input = fireKey(handler, "Escape");

    expect(onEscape).toHaveBeenCalledWith(input);
    expect(onEnter).not.toHaveBeenCalled();
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
