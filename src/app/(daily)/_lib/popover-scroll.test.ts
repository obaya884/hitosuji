import { describe, expect, it } from "vitest";
import { revealedScrollTop } from "./popover-scroll";

// 高さ100のパネルが y=200..300 にあり、120 だけスクロール済みの状態を基準にする
const panel = { top: 200, bottom: 300, scrollTop: 120 };

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

  it("先頭の候補まで戻ると scrollTop は0（それ以上遡らない）", () => {
    // scrollTop 20 のときの先頭候補は 20 だけ上にはみ出している
    expect(revealedScrollTop({ ...panel, scrollTop: 20 }, { top: 180, bottom: 200 })).toBe(0);
  });

  it("候補がパネルより高いときは上端を揃える（下端は入りきらないまま）", () => {
    expect(revealedScrollTop(panel, { top: 190, bottom: 330 })).toBe(110);
  });
});
