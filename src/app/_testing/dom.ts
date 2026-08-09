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
 * その要素自身か子孫が薄色（`text-ink-faint`）で描いている文字。無ければ `undefined`。
 * セル自身に色が付く場合と記号側の span だけに付く場合があるので、どちらで書かれているかに
 * テストを縛らない（画面定義書00_共通 §2.4 の「`--:--` は必ず薄色」の主張に使う）。
 *
 * **肯定の主張は記号を含む最小の要素に対して行う**——最初の1件しか返さないので広い要素で見ると
 * 「隣の確定値まで薄い」を見逃す。また薄色は継承するが上方向は見ないので、行全体が薄い文脈
 * （無効ルーチンの行など）では `undefined` でも視覚的には薄い。
 * 部品自身のテストは機構を定義する側なので `hasClass` を使い、画面段はこちらを使う
 */
export function faintTextOf(el: Element): string | undefined {
  if (hasClass(el, "text-ink-faint")) return el.textContent ?? undefined;
  return el.querySelector(".text-ink-faint")?.textContent ?? undefined;
}

/**
 * hex を jsdom が返す `rgb()` 表記へ変換する（6桁前提。`COLOR_VALUES` はすべて6桁）。
 * **期待値はリテラルで書かずフィクスチャの色から組み立てる**——リテラルだと、
 * フィクスチャの色を変えただけで（挙動は変わっていないのに）テストが赤くなる
 */
export function rgbOf(hex: string): string {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) throw new Error(`6桁の hex ではありません: ${hex}`);
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return `rgb(${r}, ${g}, ${b})`;
}
