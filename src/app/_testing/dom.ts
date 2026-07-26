// 画面をまたいで使う DOM の読み取りと、jsdom の表記に合わせた期待値の組み立て（T-43）。
// **画面固有の操作は各画面の `_testing/` に置く**（テスト戦略定義書 §4）。
import { screen } from "@testing-library/react";

/** セル内の文言からその行（`<tr>`）を取る。行を特定してから `within` で性質を主張するために使う */
export function rowOf(text: string): HTMLElement {
  const row = screen.getByText(text).closest("tr");
  if (row === null) throw new Error(`「${text}」の行が見つかりません`);
  return row;
}

/**
 * クラスは部分文字列ではなく**トークン**で見る（`className.toContain("bg-accent")` は
 * `hover:bg-accent-weak` にも一致してしまう）。`el.classList.contains(token)` を直に
 * 書いても同じで、**禁じたいのは `className.toContain` の方**（テスト戦略定義書 §4）
 */
export function hasClass(el: Element, token: string): boolean {
  return el.classList.contains(token);
}

/**
 * hex を jsdom が返す `rgb()` 表記へ変換する（6桁前提。`MODE_COLORS` はすべて6桁）。
 * **期待値はリテラルで書かずフィクスチャの色から組み立てる**——リテラルだと、
 * フィクスチャの色を変えただけで（挙動は変わっていないのに）テストが赤くなる
 */
export function rgbOf(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`6桁の hex ではありません: ${hex}`);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}
