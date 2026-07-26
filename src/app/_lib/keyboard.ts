import type { KeyboardEvent } from "react";

/**
 * 共通ガードが見るキーイベントの形（DOM の `KeyboardEvent` がそのまま満たす）。
 * React の `KeyboardEvent` は `isComposing` を持たないので、取り違えると型エラーになる
 */
type KeyEventLike = Readonly<{
  isComposing: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
}>;

/** 発生元（＝いまフォーカスがある要素）まで見る判定に使う */
type KeyEventWithTarget = KeyEventLike & Readonly<{ target: EventTarget | null }>;

/**
 * キー入力を操作として扱ってよいか（画面定義書00_共通 §3）。
 * IME変換中と修飾キー（Cmd/Ctrl/Alt）併用を除く。使ってよい修飾キーは Shift だけなので
 * Shift の押下は見ない（押されていれば `e.key` 自体が大文字などで届く）。
 *
 * §3 のうち無限定の2条（IME・修飾キー）だけを見るため、表示中に自前でキーを拾う
 * オーバーレイ（datepicker・選択ポップオーバー）はこちらを使う。残る2条
 * （テキスト入力中・ボタンフォーカス中の Enter）は「画面のショートカット」限定の条項で、
 * オーバーレイのキーナビはそれに当たらない。画面全体は `isGlobalShortcutEvent`。
 */
export function isOperableKeyEvent(e: KeyEventLike): boolean {
  return !e.isComposing && !e.metaKey && !e.ctrlKey && !e.altKey;
}

/**
 * 画面全体のショートカットとして扱ってよいイベントか（画面定義書00_共通 §3）。
 * `isOperableKeyEvent` に加えて、テキスト入力中（INPUT / TEXTAREA にフォーカス）を除く。
 *
 * 各画面が個別にガードを書くと1つ書き落としても気づけないため、判定はここに集約する（T-45）。
 */
export function isGlobalShortcutEvent(e: KeyEventWithTarget): boolean {
  return isOperableKeyEvent(e) && !isTextFieldTarget(e.target);
}

/**
 * イベントの発生元がボタンか（00_共通 §3）。ボタンにフォーカスがある間の `Enter` は
 * ブラウザがそのボタンを押すため、ショートカットも走ると同じ操作が二重に発火する
 */
export function isButtonTarget(target: EventTarget | null): boolean {
  return tagNameOf(target) === "BUTTON";
}

/** イベントの発生元がテキスト入力欄か（＝テキスト入力中か。00_共通 §3） */
function isTextFieldTarget(target: EventTarget | null): boolean {
  const tagName = tagNameOf(target);
  return tagName === "INPUT" || tagName === "TEXTAREA";
}

/**
 * 発生元のタグ名。`instanceof HTMLElement` を使わないのは、jsdom を持たないユニットテスト
 * （`*.test.ts`）からも素のオブジェクトを渡して検証できるようにするため
 */
function tagNameOf(target: EventTarget | null): string | undefined {
  return (target as Element | null)?.tagName;
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
