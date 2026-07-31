// ポップオーバーの表示位置の判定（画面定義書00_共通 §2.1「表示位置」）。
// この条項が及ぶのは S-01 のポップオーバーだけで、他画面には及ばない（§2.1 の「適用」列 / FB-59）。
// 実測値の読み取りは `use-flip-up.ts` に残し、判定だけを純関数にしてある（`popover-scroll.ts` と同じ流儀）。

/**
 * 上向きに開くべきか（画面定義書00_共通 §2.1）。
 * 既定は起点の下で、**下に入りきらず、かつ上の余白の方が広いときだけ** true を返す。
 * 上下どちらも狭い（同点を含む）なら下のまま——反転しても収まらないなら動かす意味がないため。
 *
 * 引数はいずれもビューポート基準のピクセル実測値
 * （パネルの `offsetHeight` / 起点の `getBoundingClientRect()` の上端・下端 / `window.innerHeight`）。
 */
export function shouldFlipUp({
  panelHeight,
  anchorTop,
  anchorBottom,
  viewportHeight,
}: Readonly<{
  panelHeight: number;
  anchorTop: number;
  anchorBottom: number;
  viewportHeight: number;
}>): boolean {
  const spaceBelow = viewportHeight - anchorBottom;
  const spaceAbove = anchorTop;
  return panelHeight > spaceBelow && spaceAbove > spaceBelow;
}
