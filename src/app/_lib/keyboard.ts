import type { KeyboardEvent } from "react";

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
