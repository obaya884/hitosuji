import type { KeyboardEvent } from "react";
import { describe, expect, it, vi } from "vitest";

import {
  inlineEditKeyHandler,
  isButtonTarget,
  isGlobalShortcutEvent,
  isOperableKeyEvent,
} from "./keyboard";

/**
 * 判定に使う項目だけを持つキーイベント（既定は素のキー・BODY にフォーカス）。
 * `shiftKey` は本番の型（KeyEventLike）にあえて含めていない項目だが、
 * 「Shift は見ない」という契約を固定するためテスト側では渡せるようにしている
 */
const keyEvent = (
  override: Partial<{
    isComposing: boolean;
    metaKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    shiftKey: boolean;
    target: EventTarget | null;
  }> = {}
) => ({
  isComposing: false,
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  target: focusOn("BODY"),
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

describe("isOperableKeyEvent（画面定義書00_共通 §3: IME変換中・修飾キー併用は操作として扱わない）", () => {
  it("素のキーは操作として扱う", () => {
    expect(isOperableKeyEvent(keyEvent())).toBe(true);
  });

  it.each(BLOCKED_BY_EVENT)("%s のキーは操作として扱わない", (_label, override) => {
    expect(isOperableKeyEvent(keyEvent(override))).toBe(false);
  });

  it("Shift 併用は弾かない（使ってよい修飾キーは Shift のみ）", () => {
    expect(isOperableKeyEvent(keyEvent({ shiftKey: true }))).toBe(true);
  });
});

describe("isGlobalShortcutEvent（画面定義書00_共通 §3: 画面全体のショートカットの共通ガード）", () => {
  it("素のキーは操作として扱う", () => {
    expect(isGlobalShortcutEvent(keyEvent())).toBe(true);
  });

  it.each(BLOCKED_BY_EVENT)("%s のキーは操作として扱わない", (_label, override) => {
    expect(isGlobalShortcutEvent(keyEvent(override))).toBe(false);
  });

  it("Shift 併用は弾かない（使ってよい修飾キーは Shift のみ）", () => {
    expect(isGlobalShortcutEvent(keyEvent({ shiftKey: true }))).toBe(true);
  });

  it.each(["INPUT", "TEXTAREA"])(
    "テキスト入力中（%s にフォーカス）は操作として扱わない",
    (tagName) => {
      expect(isGlobalShortcutEvent(keyEvent({ target: focusOn(tagName) }))).toBe(false);
    }
  );

  it.each(["BUTTON", "DIV", "BODY"])(
    "入力欄以外（%s）にフォーカスがあるだけでは弾かない",
    (tagName) => {
      expect(isGlobalShortcutEvent(keyEvent({ target: focusOn(tagName) }))).toBe(true);
    }
  );

  it("発生元が無い（target が null）キーは操作として扱う", () => {
    expect(isGlobalShortcutEvent(keyEvent({ target: null }))).toBe(true);
  });

  it("発生元が要素でない（window / document 等）キーは操作として扱う", () => {
    // リスナは window / document に張るため、tagName を持たない発生元が届きうる
    expect(isGlobalShortcutEvent(keyEvent({ target: {} as EventTarget }))).toBe(true);
  });
});

describe("2つのガードの差（オーバーレイは入力欄ガードを持たない。統一の可否は裁定待ち）", () => {
  // 関数を2本に分けた理由はこの1点だけ。ここが崩れると datepicker・ポップオーバーの挙動が変わる
  it("入力欄にフォーカスがあるとき、画面全体は弾くがオーバーレイは弾かない", () => {
    expect(isOperableKeyEvent(keyEvent({ target: focusOn("INPUT") }))).toBe(true);
    expect(isGlobalShortcutEvent(keyEvent({ target: focusOn("INPUT") }))).toBe(false);
  });
});

describe("isButtonTarget（画面定義書00_共通 §3: ボタンフォーカス中の Enter は二重発火を避ける）", () => {
  it("ボタンにフォーカスがあるとき true", () => {
    expect(isButtonTarget(focusOn("BUTTON"))).toBe(true);
  });

  it.each(["INPUT", "DIV", "BODY"])("%s にフォーカスがあるときは false", (tagName) => {
    expect(isButtonTarget(focusOn(tagName))).toBe(false);
  });

  it("発生元が無いときは false", () => {
    expect(isButtonTarget(null)).toBe(false);
  });
});

// jsdom を要さない（イベントの形だけを見る純粋関数）ため *.test.ts に置く
describe("inlineEditKeyHandler（画面定義書00_共通 §2.3: Enter 保存 / Escape 取消、§3: IME変換中は操作として扱わない）", () => {
  const fireKey = (
    handler: (e: KeyboardEvent<HTMLInputElement>) => void,
    key: string,
    nativeEvent: Readonly<{ isComposing?: boolean }> = {},
    keyCode = 0,
    shiftKey = false
  ) => {
    const input = { value: "入力値" } as HTMLInputElement;
    handler({
      key,
      keyCode,
      shiftKey,
      nativeEvent: { isComposing: false, ...nativeEvent },
      currentTarget: input,
    } as unknown as KeyboardEvent<HTMLInputElement>);
    return input;
  };

  /** `Shift+<key>` を撃つ（複数行入力＝コメント欄 O-16 の分岐を見るため） */
  const fireShiftKey = (handler: (e: KeyboardEvent<HTMLInputElement>) => void, key: string) =>
    fireKey(handler, key, {}, 0, true);

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

  // 複数行入力（コメント欄 O-16）だけ Shift+Enter を改行として通す。1行の入力欄は改行を持たないので
  // 既定（multiline 未指定）では Shift 併用でも確定する——ここを取り違えると
  // タスク名・見積もり・打刻・マスタ管理の全インライン編集が Shift+Enter で確定しなくなる
  describe("multiline（画面定義書01 O-16 / §6: コメント欄だけ Shift+Enter が改行）", () => {
    it("multiline 未指定なら Shift+Enter でも確定する（1行入力欄の既定は変えない）", () => {
      const onEnter = vi.fn();
      const handler = inlineEditKeyHandler({ onEnter, onEscape: vi.fn() });

      const input = fireShiftKey(handler, "Enter");

      expect(onEnter).toHaveBeenCalledWith(input);
    });

    it("multiline なら Shift+Enter は確定も取消もしない（改行として素通しする）", () => {
      const onEnter = vi.fn();
      const onEscape = vi.fn();
      const handler = inlineEditKeyHandler({ onEnter, onEscape, multiline: true });

      fireShiftKey(handler, "Enter");

      expect(onEnter).not.toHaveBeenCalled();
      expect(onEscape).not.toHaveBeenCalled();
    });

    it("multiline でも Shift なしの Enter は確定する", () => {
      const onEnter = vi.fn();
      const handler = inlineEditKeyHandler({ onEnter, onEscape: vi.fn(), multiline: true });

      const input = fireKey(handler, "Enter");

      expect(onEnter).toHaveBeenCalledWith(input);
    });

    it("Escape は multiline でも Shift 併用でも取消のまま（改行の分岐に巻き込まない）", () => {
      const onEscape = vi.fn();
      const handler = inlineEditKeyHandler({ onEnter: vi.fn(), onEscape, multiline: true });

      const input = fireShiftKey(handler, "Escape");

      expect(onEscape).toHaveBeenCalledWith(input);
    });
  });
});
