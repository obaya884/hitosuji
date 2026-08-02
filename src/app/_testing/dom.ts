// 画面をまたいで使うクラス判定と、jsdom の表記に合わせた期待値の組み立て（T-43）。
// **画面固有の操作・読み取りは各画面の `_testing/` に置く**（テスト戦略定義書 §4）——
// 行の取り方は表の作りごとに違うので、ここには置かない（デイリーは名前セルがボタン、
// マスタはアーカイブ済み行が素のテキスト）。

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
