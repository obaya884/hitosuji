import type { KeyboardEvent } from "react";

/** 共通ガードが見るキーイベントの形（DOM の `KeyboardEvent` がそのまま満たす） */
type KeyEventLike = Readonly<{
  isComposing: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}>;

/**
 * IME変換中でなく、修飾キー（Cmd/Ctrl/Alt）も併用していないキーか（画面定義書00_共通 §3）。
 *
 * 表示中に自前でキーを拾うオーバーレイ（datepicker・選択ポップオーバー）が使う。
 * オーバーレイは開いているあいだテキスト入力欄を伴わないため、入力欄ガードを持たない。
 * 画面全体のショートカットは `isShortcutEvent` を使う。
 */
export function isPlainKeyEvent(e: KeyEventLike): boolean {
  return !e.isComposing && !e.metaKey && !e.ctrlKey && !e.altKey;
}

/**
 * 画面全体のショートカットとして扱ってよいイベントか（画面定義書00_共通 §3）。
 * `isPlainKeyEvent` に加えて、テキスト入力中（INPUT / TEXTAREA にフォーカス）を除く。
 *
 * 各画面が個別にガードを書くと1つ書き落としても気づけないため、判定はここに集約する（T-45）。
 */
export function isShortcutEvent(
  e: KeyEventLike & Readonly<{ target: EventTarget | null }>
): boolean {
  return isPlainKeyEvent(e) && !isTextFieldTarget(e.target);
}

/** イベントの発生元がテキスト入力欄か（＝テキスト入力中か。00_共通 §3） */
function isTextFieldTarget(target: EventTarget | null): boolean {
  const tagName = (target as HTMLElement | null)?.tagName;
  return tagName === "INPUT" || tagName === "TEXTAREA";
}

/**
 * インライン編集の Enter 保存 / Escape 取消のハンドラを作る。
 * IME変換中のキーは操作として扱わない（画面定義書01 §6）。日本語入力の変換確定 Enter が
 * そのまま保存として発火するのを防ぐ。keyCode 229 は isComposing 未対応環境向けの保険。
 */
export function inlineEditKeyHandler(
  handlers: Readonly<{
    /** 入力欄自身を受け取る（値の読み取り・フォーカス操作に使い、ref を持たずに済む） */
    onEnter: (input: HTMLInputElement) => void;
    onEscape: (input: HTMLInputElement) => void;
  }>
) {
  return (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
    if (e.key === "Enter") handlers.onEnter(e.currentTarget);
    if (e.key === "Escape") handlers.onEscape(e.currentTarget);
  };
}
