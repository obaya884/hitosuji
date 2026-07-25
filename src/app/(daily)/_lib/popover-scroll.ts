// ポップオーバー内のアクティブ候補を見せるためのスクロール量（画面定義書00_共通 §2.1 / F-112）。
// `Element.scrollIntoView({ block: "nearest" })` は使えない——祖先（ドキュメント）まで遡って
// スクロールする仕様のため、開いた直後にページが動いて `useFlipUp` の上向き反転判定
// （00_共通 §2.1「表示位置」）が動いた後の幾何を見てしまい、反転が起きなくなる。
// パネル自身の scrollTop だけを動かすため、計算だけを純関数に切り出してテストする。

/**
 * アクティブ候補がパネルの表示領域に入る `scrollTop` を返す。
 * 見えていれば動かさず、はみ出していればはみ出した分だけ動かす（`block: "nearest"` と同じ最小移動）。
 * 上下ともはみ出す（候補がパネルより高い）場合は上端を揃える。
 *
 * 座標はいずれも `getBoundingClientRect()` のビューポート基準の値を渡す。
 */
export function revealedScrollTop(
  panel: Readonly<{ top: number; bottom: number; scrollTop: number }>,
  item: Readonly<{ top: number; bottom: number }>
): number {
  if (item.top < panel.top) return panel.scrollTop - (panel.top - item.top);
  if (item.bottom > panel.bottom) return panel.scrollTop + (item.bottom - panel.bottom);
  return panel.scrollTop;
}
