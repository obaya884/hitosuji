// ブラウザ段（テスト戦略定義書 §3 / T-138）。選択行のスクロール追従（画面定義書01 §5 /
// FB-20・FB-77）が**固定領域（§2）の裏で止まらない**ことを測る唯一の場所。
//
// jsdom 段は `scrollIntoView` を呼んだかどうか（`daily-list.test.tsx`）と、`scroll-margin-top` に
// 何 px を配ったか（同）までしか主張できない——レイアウトが無いので「行が見出しの裏に隠れたか」は
// 誰も確かめていなかった。ここが持つのは次の2つだけ:
//   1. 積み上げた3段の高さ（板＋列見出し＋セクション見出し）が**実際の固定領域と一致する**こと
//   2. `scrollIntoView({ block: "nearest" })` ＋ `scroll-margin-top` の停止位置が、
//      上方向へ戻したときに**その固定領域を避ける**こと
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UNCATEGORIZED_LABEL } from "@/app/_lib/unset";
import type { Task } from "@/domain/task/task";
import { task } from "@/domain/task/testing/task";

import { renderBoard, setupBoardInBrowser } from "../_testing/board-helpers";
import { ICON_SIZE_CSS, installGeometryStyles } from "../_testing/geometry-styles";
import { headingOf, isSelected, taskRows } from "../_testing/table-helpers";

vi.mock("../actions", async () => (await import("../_testing/action-mocks")).actionMocks());

setupBoardInBrowser();

/** 測る対象は貼り付きそのもの（貼り付かなければ隠れようがない）なので、実物のクラス名に敷く */
installGeometryStyles(`
  .sticky { position: sticky }
  .top-0 { top: 0 }
  ${ICON_SIZE_CSS}
`);

/** 画面をスクロールさせるための行数（viewport 800 に対して十分に長い一覧を作る） */
const ROW_COUNT = 50;
/** K で戻る段数。戻る途中の行はどれも固定領域の裏から出ていなければならない */
const UP_STEPS = 20;
/**
 * 一覧の中ほどまで下る段数。**「見えているなら動かさない」を試せるのは中ほどだけ**——先頭
 * （scrollY=0）と末尾はスクロールが clamp され、`block` を `center` 等に変えても動かない
 */
const MIDDLE_STEPS = 25;
/** スクロール位置を viewport の途中に置く量（貼り付きが起きている状態を作る） */
const SCROLLED = 400;

/** 幾何の比較に許す誤差（px）。サブピクセルの丸めだけを吸収する */
const EPSILON = 0.5;

/**
 * 未分類（インボックス）だけに積んだ一覧。**1グループに寄せる**のは、貼り付いた見出しが
 * スクロールのあいだずっと未分類のものになり、固定領域の下端を1つの要素で測れるようにするため
 */
function manyTasks(): Task[] {
  return Array.from({ length: ROW_COUNT }, (_, i) =>
    task({ id: i + 1, name: `タスク${String(i + 1).padStart(2, "0")}` })
  );
}

/** 選択行（面色で示す。§5）。**見えるべき行と測る行を一致させる**ために面色から引く */
function selectedRow(): HTMLElement {
  const selected = taskRows().filter((tr) => isSelected(tr));
  if (selected.length !== 1) throw new Error(`選択行が ${selected.length} 件あります`);
  return selected[0]!;
}

/** 固定領域（§2 の3段）の下端。貼り付いた見出しの下端がそのまま境界になる */
function fixedAreaBottom(): number {
  return headingOf(UNCATEGORIZED_LABEL).getBoundingClientRect().bottom;
}

/** 行が追従で避ける高さ（§5）。リストが3段を積んで配った値 */
function scrollMarginTop(): number {
  return Number.parseFloat(taskRows()[0]!.style.scrollMarginTop);
}

/** 見出しが貼り付く位置（§2 の上2段）。下の待ち合わせが**測る対象と別の値**を見るために使う */
function sectionHeadTop(): number {
  return Number.parseFloat(headingOf(UNCATEGORIZED_LABEL).style.top);
}

/**
 * 3段の実測は ResizeObserver 経由で届くので、届くまで待つ。**待つのは見出しの `top`**——
 * 各テストが測る `scroll-margin-top` で待つと、それを壊す変異が「前提が来ない」形で落ち、
 * 幾何の主張が効いたのかどうかが読めなくなる。
 *
 * これで足りるのは**3つの実測が同じ配信で届く**ため（見出しの `top` は上2段、
 * `scroll-margin-top` はそれに3段目を足したもの）。分かれて届くようになると 3段目だけ遅れて
 * **赤フレーク**になる——嘘の緑ではないので、落ちたらここを疑う
 */
async function renderAndSettle() {
  renderBoard(manyTasks());
  await expect.poll(sectionHeadTop).toBeGreaterThan(0);
}

/** 最終行まで下る（`moveSelection` は端で止まるので、行数ぶん押せば必ず最後に着く。§5） */
async function pressDownToLastRow() {
  await userEvent.keyboard("j".repeat(ROW_COUNT));
}

// ページのスクロール位置は文書に残るので、次のテストの幾何を狂わせないよう毎回戻す
afterEach(() => window.scrollTo(0, 0));

describe("選択行のスクロール追従（画面定義書01 §5: 固定見出しの裏に隠さない。ブラウザ段）", () => {
  it("段の前提: 見出しが実際に貼り付いている（貼り付かなければ隠れようがなく、何も試していない）", async () => {
    await renderAndSettle();
    window.scrollTo(0, SCROLLED);

    // 貼り付いていなければスクロールぶん上へ流れ、指定した `top` から外れる
    const heading = headingOf(UNCATEGORIZED_LABEL);
    expect(heading.getBoundingClientRect().top).toBeCloseTo(sectionHeadTop(), 1);
  });

  it("積み上げた3段の高さが実際の固定領域と一致する（§2 / FB-77）", async () => {
    await renderAndSettle();
    window.scrollTo(0, SCROLLED);

    // 板＋列見出し＋セクション見出しの積み上げ（＝§5 の停止位置）と、貼り付いた見出しの実際の下端。
    // ここがずれたまま追従だけ合わせても、行は見出しの裏に入る
    expect(fixedAreaBottom()).toBeCloseTo(scrollMarginTop(), 1);
  });

  it("下方向へ移った選択行は画面内へ入る（§5 / FB-20: 選択行は常に見える）", async () => {
    await renderAndSettle();

    await pressDownToLastRow();

    // 前提: 一覧は viewport に収まらず、実際にスクロールしている
    expect(window.scrollY).toBeGreaterThan(0);
    expect(selectedRow().getBoundingClientRect().bottom).toBeLessThanOrEqual(
      window.innerHeight + EPSILON
    );
  });

  /**
   * §5 の「追従は**見えていないときだけ最小限スクロールする**（既に見えているなら動かさない）」。
   * jsdom 段（`daily-list.test.tsx`）は「`nearest` の実挙動はブラウザ段でしか確かめられない」と
   * 明示してこちらへ委ねている
   */
  it("すでに見えている行へ移ってもページは動かない（§5: 見えているなら動かさない）", async () => {
    await renderAndSettle();

    // **中ほどで測る**（定数の JSDoc）。端では clamp が効き、`nearest` を崩しても動かない
    await userEvent.keyboard("j".repeat(MIDDLE_STEPS));
    const scrolled = window.scrollY;
    expect(scrolled).toBeGreaterThan(0); // 前提: 先頭ではない位置にいる

    await userEvent.keyboard("k"); // 直上の行＝すでに見えている

    expect(window.scrollY).toBe(scrolled);
  });

  it("上方向へ戻す選択行は固定領域の下で止まる（§5 / FB-77: 見出しの裏に隠れない）", async () => {
    await renderAndSettle();

    await pressDownToLastRow();
    const scrolledDown = window.scrollY;
    expect(scrolledDown).toBeGreaterThan(0); // 前提: 下へスクロールしている

    // 1段ずつ戻す。上へはみ出した行を見せるたびに、停止位置が固定領域を避けているかを見る。
    // 崩れた段は**集めてから**主張する——ループ内で落とすと何段目でどれだけ崩れたかが残らない
    const problems: string[] = [];
    for (let step = 1; step <= UP_STEPS; step++) {
      await userEvent.keyboard("k");

      // 見出しが剥がれると上へ流れ、以降の重なりが常に負＝**全段が空振りしても緑**になる。
      // 段ごとに貼り付きを主張して、その経路を塞ぐ
      const heading = headingOf(UNCATEGORIZED_LABEL).getBoundingClientRect();
      if (Math.abs(heading.top - sectionHeadTop()) > EPSILON) {
        problems.push(`${step}段目: 見出しが貼り付いておらず、この段は測れていない`);
        continue;
      }

      const overlap = heading.bottom - selectedRow().getBoundingClientRect().top;
      if (overlap > EPSILON) problems.push(`${step}段目で ${overlap.toFixed(1)}px 隠れた`);
    }

    expect(problems).toEqual([]);
    // 前提: 実際に上方向のスクロールが起きている（起きていなければ何も試していない）
    expect(window.scrollY).toBeLessThan(scrolledDown);
  });
});
