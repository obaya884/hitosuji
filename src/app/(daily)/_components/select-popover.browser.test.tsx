// ブラウザ段（テスト戦略定義書 §3 / T-138）。ポップオーバー内のスクロール（00_共通 §2.1 /
// F-112）のうち、**計算ではなく適用**を測る唯一の場所。
//
// 量の計算は純関数のユニット段（`popover-scroll.test.ts`）が網羅済みで、jsdom 段は
// `scrollTop` も `getBoundingClientRect()` も 0 なので「アクティブ候補が実際に見えたか」を
// 主張できない。この段が持つのは次の2つだけ:
//   1. 計算した `scrollTop` が**効いて**、ハイライトされた候補がパネルの表示領域に入ること
//   2. 動くのは**パネルだけで、ドキュメントは動かないこと**——`scrollIntoView` を使わない理由
//      （`popover-scroll.ts` 冒頭）。祖先まで遡ってスクロールされるとページが動き、
//      `useFlipUp` の上向き反転判定（00_共通 §2.1「表示位置」/ FB-51）が狂う
import { render } from "@testing-library/react";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ICON_SIZE_CSS, installGeometryStyles } from "../_testing/geometry-styles";
import { activePopoverOption, popoverPanel } from "../_testing/table-helpers";
import { SelectPopover, type PopoverOption } from "./select-popover";

/** パネルの表示領域の高さ（実物の `max-h-64` ＝ 16rem） */
const PANEL_MAX_HEIGHT = 256;
/** パネルの上端。viewport（設定が定める 800）の下端をまたがせ、下方の候補を画面外に置く */
const PANEL_TOP = 640;
/** ドキュメントをスクロールできる高さにする余白。「動かさない」は動かせる状態でしか主張できない */
const PAGE_TAIL_HEIGHT = 1200;

/**
 * 測る対象はパネルの箱そのもの（はみ出しが起きなければ何も測れない）なので、実物のクラス名に敷く。
 * 候補を1行1件にするのは §2.1「候補は1行に収める」を実物の flex/w-full の代わりに満たすため
 */
installGeometryStyles(`
  .max-h-64 { max-height: ${PANEL_MAX_HEIGHT}px }
  .overflow-y-auto { overflow-y: auto }
  [data-option-index] { display: block; width: 100% }
  ${ICON_SIZE_CSS}
`);

/** 候補の一覧。パネルの表示領域に収まりきらない数にする（収まると、はみ出しようがなく何も測れない） */
const OPTIONS: readonly PopoverOption[] = Array.from({ length: 24 }, (_, i) => ({
  id: i + 1,
  label: `候補${String(i + 1).padStart(2, "0")}`,
}));

/** 先頭の候補の id。ここを現在値にすると、開いた時点でスクロールの要らない状態から始められる */
const FIRST_OPTION_ID = 1;
/** 一覧の下方にある候補の id。開いた時点で「はみ出した現在値」になる位置に置く */
const LOWER_OPTION_ID = 20;

/** J/K を連打する段数。パネルの表示領域に収まる件数を必ず超える数にする */
const MOVE_STEPS = 15;
/** 現在値からさらに下げる段数（一覧の末尾まで届く数）。ドキュメントを動かさないことの確認に使う */
const STEPS_TO_LAST_OPTION = OPTIONS.length - 1;

/** 幾何の比較に許す誤差（px）。サブピクセルの丸めだけを吸収する */
const EPSILON = 0.5;

function renderPopover(selectedId: number, options: readonly PopoverOption[] = OPTIONS) {
  render(
    <>
      <div style={{ height: PANEL_TOP }} />
      <SelectPopover
        options={options}
        selectedId={selectedId}
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />
      <div style={{ height: PAGE_TAIL_HEIGHT }} />
    </>
  );
}

/** ハイライトされた候補がパネルの表示領域に収まっていること（負の余白＝その辺からはみ出している） */
function expectActiveOptionIsVisible() {
  const panel = popoverPanel().getBoundingClientRect();
  const option = activePopoverOption().getBoundingClientRect();

  expect(option.top - panel.top).toBeGreaterThanOrEqual(-EPSILON);
  expect(panel.bottom - option.bottom).toBeGreaterThanOrEqual(-EPSILON);
}

// ページのスクロール位置は文書に残るので、次のテストの幾何を狂わせないよう毎回戻す
afterEach(() => window.scrollTo(0, 0));

describe("SelectPopover のスクロール（00_共通 §2.1: アクティブ候補をパネル内に見せる。ブラウザ段）", () => {
  it("段の前提: パネルはスクロールできる箱で、下端は viewport の外にある", () => {
    // ここが崩れると以下3本は「はみ出しようのない候補」を測ることになり、嘘の緑になる。
    // パネルの箱は実物のクラス（`max-h-64` / `overflow-y-auto`）に敷いてあるので、
    // 実装がクラスを変えればこの前提が最初に落ちる
    renderPopover(FIRST_OPTION_ID);
    const panel = popoverPanel();

    expect(panel.clientHeight).toBeLessThan(panel.scrollHeight);
    expect(panel.getBoundingClientRect().bottom).toBeGreaterThan(window.innerHeight);
    // 「ドキュメントを動かさない」は**動かせる**ことが前提（動かせなければ空振りで緑になる）
    expect(document.documentElement.scrollHeight).toBeGreaterThan(window.innerHeight);
  });

  it("開いた直後、下方にある現在値までパネルがスクロールして見える（F-112: 現在値をハイライト）", () => {
    renderPopover(LOWER_OPTION_ID);

    expect(popoverPanel().scrollTop).toBeGreaterThan(0);
    expectActiveOptionIsVisible();
  });

  it("J/K で動かしたアクティブ候補も、はみ出すたびにパネル内へ入る（F-112）", async () => {
    renderPopover(FIRST_OPTION_ID);
    // 先頭がハイライトされた状態から始まるので、開いた時点ではスクロールしていない
    expect(popoverPanel().scrollTop).toBe(0);

    await userEvent.keyboard("j".repeat(MOVE_STEPS));
    expect(popoverPanel().scrollTop).toBeGreaterThan(0);
    expectActiveOptionIsVisible();

    // 上へはみ出す側（K）も同じように戻す。先頭まで戻れば scrollTop は 0
    await userEvent.keyboard("k".repeat(MOVE_STEPS));
    expectActiveOptionIsVisible();
    expect(popoverPanel().scrollTop).toBe(0);
  });

  /**
   * `select-popover.tsx` は「区切り線も子要素として並ぶため、子の順番ではなく候補の index を
   * 直に引く」と書いている（§4.3 / FB-51）。**固定項目が無い並びでは index と子の順番が一致して
   * しまう**ので、上の3本はこの条項を守れない——引き方を子の順番に変えても緑のままになる
   */
  it("固定項目の区切り線を挟んでも、ハイライトされた候補そのものが見える（§4.3）", async () => {
    const pinned: PopoverOption = { id: LOWER_OPTION_ID, label: "現在のセクションへ", isPinned: true };
    renderPopover(FIRST_OPTION_ID, [pinned, ...OPTIONS]);

    await userEvent.keyboard("j".repeat(MOVE_STEPS));

    expectActiveOptionIsVisible();
  });

  it("動かすのはパネルだけで、ドキュメントは動かさない（`scrollIntoView` を使わない理由。FB-51）", async () => {
    renderPopover(LOWER_OPTION_ID);
    // 開いた時点で下方の現在値を見せている（＝祖先まで遡るなら、ここでもう動いている）
    expect(window.scrollY).toBe(0);

    await userEvent.keyboard("j".repeat(STEPS_TO_LAST_OPTION));

    // 前提: アクティブ候補はパネル内には入ったが viewport の外にある。
    // ここが viewport 内なら「ドキュメントを動かす必要が無い」状態で、何も試していない
    expectActiveOptionIsVisible();
    expect(activePopoverOption().getBoundingClientRect().bottom).toBeGreaterThan(
      window.innerHeight
    );

    expect(window.scrollY).toBe(0);
  });
});
