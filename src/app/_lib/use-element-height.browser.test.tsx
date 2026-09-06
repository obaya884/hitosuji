// ブラウザ段（テスト戦略定義書 §3 / T-03）。jsdom はレイアウトを計算せず高さが常に 0 なので、
// **段と段の継ぎ目に隙間が開くかどうか**を測れるのはこの段だけ。FB-111 の症状——貼り付いた
// セクション見出しの上に 1px 弱の隙間が開き、裏を流れるタスク行が覗く——を直訳して測る。
//
// **この段に Tailwind は無い**ので、幾何はインライン style で最小の3段を組む
// （`use-flip-up.browser.test.tsx` と同じ流儀）。したがってここが守るのは**測り方**
// （`useElementHeight` が丸めない）まで——どの要素を測りどう積むか（画面定義書01 §2 の3段）は
// jsdom 段（`daily-list.test.tsx`）が押さえ、実物の盤面での積み上げは
// `(daily)/_components/daily-board.scroll.browser.test.tsx` が測る（T-138。実物を描く場合は
// 幾何に効くクラスだけを敷いてよい＝テスト戦略定義書 §3 の例外）。
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { useElementHeight } from "./use-element-height";

/** 実高を小数にする高さ。実機でも板・セルの実高は端数を持つ（FB-111 の実測は 146 と 36.5）。
 * 列見出しは**collapse で共有される罫線の半分（0.5px）が乗る**ので、そのぶんずらして端数を残す */
const BOARD_HEIGHT = "40.5px";
const COLUMN_HEAD_HEIGHT = "36.25px";
/** 貼り付きを起こすために積む行数（viewport 800 を超えさせる） */
const ROW_COUNT = 40;

/**
 * 画面上部の板 → 列見出し → セクション見出しの3段（§2）。**下の段の `top` は上の段の
 * 実測高さの積み上げ**という、実物と同じ配線で組む
 */
function StickyStack() {
  const [boardRef, boardHeight] = useElementHeight<HTMLDivElement>();
  const [columnHeadRef, columnHeadHeight] = useElementHeight<HTMLTableCellElement>();

  return (
    <>
      <div
        ref={boardRef}
        style={{ position: "sticky", top: 0, height: BOARD_HEIGHT, background: "white" }}
      />
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th
              ref={columnHeadRef}
              data-testid="column-head"
              style={{
                position: "sticky",
                top: boardHeight,
                height: COLUMN_HEAD_HEIGHT,
                padding: 0,
                background: "white",
                borderBottom: "1px solid black",
              }}
            >
              タスク
            </th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td
              data-testid="section-head"
              style={{
                position: "sticky",
                top: boardHeight + columnHeadHeight,
                height: "30px",
                padding: 0,
                background: "silver",
              }}
            >
              朝
            </td>
          </tr>
          {Array.from({ length: ROW_COUNT }, (_, i) => (
            <tr key={i}>
              <td data-role="row" style={{ height: "30px", padding: 0 }}>
                朝食
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

/** 段の継ぎ目の隙間（正なら隙間が開いていて裏の行が覗く。負なら重なっていて下罫線を隠す） */
function gapBelow(upper: HTMLElement, lower: HTMLElement): number {
  return lower.getBoundingClientRect().top - upper.getBoundingClientRect().bottom;
}

describe("固定領域の段の継ぎ目（画面定義書01 §2。ブラウザ段）", () => {
  it("貼り付いた見出しの上に隙間が開かない（FB-111: 開くと裏を流れる行が覗く）", async () => {
    const { getByTestId } = render(<StickyStack />);
    const board = getByTestId("column-head").closest("table")!.previousElementSibling as HTMLElement;
    const columnHead = getByTestId("column-head");
    const sectionHead = getByTestId("section-head");

    window.scrollTo(0, 300);

    // 前提: この段でしか作れない「実高が小数」の状態になっていること（整数なら丸めても隙間は開かない）
    expect(columnHead.getBoundingClientRect().height % 1).not.toBe(0);

    // 実測は ResizeObserver 経由で届くので、初回の通知を待つ（描画の直後は測る前の 0）
    await expect.poll(() => gapBelow(columnHead, sectionHead)).toBeCloseTo(0, 2);
    expect(gapBelow(board, columnHead)).toBeCloseTo(0, 2);
  });

  it("継ぎ目にタスク行が覗かない（FB-111 の症状そのもの）", async () => {
    const { getByTestId } = render(<StickyStack />);
    const columnHead = getByTestId("column-head");
    const sectionHead = getByTestId("section-head");

    window.scrollTo(0, 300);
    await expect.poll(() => gapBelow(columnHead, sectionHead)).toBeCloseTo(0, 2);

    // 継ぎ目の前後を細かく突いて、貼り付いていない行のセルが顔を出さないことを見る
    const seam = columnHead.getBoundingClientRect().bottom;
    const peeking = [-0.5, -0.25, 0, 0.25, 0.5]
      .map((d) => document.elementFromPoint(100, seam + d))
      .filter((el) => (el as HTMLElement | null)?.dataset.role === "row");

    expect(peeking).toEqual([]);
  });
});
