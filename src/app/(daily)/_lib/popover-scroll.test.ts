import { describe, expect, it } from "vitest";
import { revealedScrollTop } from "./popover-scroll";

// 高さ100のパネルが y=200..300 にあり、120 だけスクロール済みの状態を基準にする
const panel = { top: 200, bottom: 300, scrollTop: 120 };

// 返すのは「はみ出した分だけ動かした値」で、負値のクランプは持たない（丸めるのはブラウザ側。
// 実 DOM での `scrollTop` の下限は `select-popover.browser.test.tsx` が押さえる）
describe("revealedScrollTop（画面定義書00_共通 §2.1: アクティブ候補をパネル内に見せる）", () => {
  it("候補が表示領域に収まっていれば動かさない", () => {
    expect(revealedScrollTop(panel, { top: 220, bottom: 240 })).toBe(120);
  });

  it("候補の上端がパネル上端と同じなら動かさない（境界は「はみ出し」に数えない）", () => {
    expect(revealedScrollTop(panel, { top: 200, bottom: 220 })).toBe(120);
  });

  it("候補の下端がパネル下端と同じなら動かさない", () => {
    expect(revealedScrollTop(panel, { top: 280, bottom: 300 })).toBe(120);
  });

  it("上へはみ出した分だけ scrollTop を減らす（K での移動）", () => {
    expect(revealedScrollTop(panel, { top: 185, bottom: 205 })).toBe(105);
  });

  it("下へはみ出した分だけ scrollTop を足す（J での移動）", () => {
    expect(revealedScrollTop(panel, { top: 290, bottom: 312 })).toBe(132);
  });

  // 上下ともはみ出すときは**上端を揃える側が勝つ**。2つの `if` の順序を入れ替えると
  // ここだけが落ちる（上下どちらか一方のテストでは順序を測れない）
  it("候補がパネルより高いときは上端を揃える（下端は入りきらないまま）", () => {
    expect(revealedScrollTop(panel, { top: 190, bottom: 330 })).toBe(110);
  });
});
