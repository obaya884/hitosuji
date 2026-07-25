// ポップオーバーを上向きへ反転するかの判定（画面定義書00_共通 §2.1「表示位置」）。
// jsdom はレイアウト計算をせず `offsetHeight`・`getBoundingClientRect()` が常に 0 を返すため、
// 実測値を読む箇所（`use-flip-up.ts`）に判定式を残すとどの段でも検証できない。
// 実測値を引数で受け取る純関数に切り出してユニット段へ落とす
// （アーキテクチャ定義書 §8「段の呼び名と境界」。`popover-scroll.ts` と同じ流儀）。

/** 反転判定に要る実測値。いずれもビューポート基準のピクセル値 */
export type FlipUpMetrics = Readonly<{
  /** パネルの高さ（`offsetHeight`） */
  panelHeight: number;
  /** 起点（アンカー）の上端・下端（`getBoundingClientRect()`） */
  anchorTop: number;
  anchorBottom: number;
  /** ビューポートの高さ（`window.innerHeight`） */
  viewportHeight: number;
}>;

/**
 * 上向きに開くべきか（画面定義書00_共通 §2.1）。
 * 既定は起点の下で、**下に入りきらず、かつ上の余白の方が広いときだけ** true を返す。
 * 上下どちらも狭い（同点を含む）なら下のまま——反転しても収まらないなら動かす意味がないため。
 */
export function shouldFlipUp({
  panelHeight,
  anchorTop,
  anchorBottom,
  viewportHeight,
}: FlipUpMetrics): boolean {
  const spaceBelow = viewportHeight - anchorBottom;
  const spaceAbove = anchorTop;
  return panelHeight > spaceBelow && spaceAbove > spaceBelow;
}
