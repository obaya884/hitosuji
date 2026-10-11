// ブラウザ段（テスト戦略定義書 §3 / T-138・T-144・T-165）。スクロール中の固定領域（画面定義書01 §2）の
// 貼り付き・重なりと、それに対する選択行のスクロール追従（§5 / FB-20・FB-77）を実測する唯一の場所。
//
// jsdom 段は `scrollIntoView` を呼んだかどうか（`daily-list.test.tsx`）と、`scroll-margin-top` に
// 何 px を配ったか（同）、固定領域のクラスの有無までしか主張できない——レイアウトが無いので
// 「行が見出しの裏に隠れたか」「どの段が手前か」は誰も確かめていなかった。ここが持つのは次の5つだけ:
//   1. 積み上げた3段の高さ（板＋列見出し＋セクション見出し）が**実際の固定領域と一致する**こと
//   2. `scrollIntoView({ block: "nearest" })` ＋ `scroll-margin-top` の停止位置が、
//      上方向へ戻したときに**その固定領域を避ける**こと
//   3. 板が警告バナー（§8 / FB-116）を含んで高くなっても 1 が保たれ、バナーが画面内に残ること
//   4. スクロール中に重なった点で**どの段が手前に描かれるか**（§2 の重なり順）——
//      クラスの有無だけでは、z-index が入れ替わっても全段が緑のまま通る
//   5. 行内の浮遊面（ポップオーバー・行メニュー。画面定義書00_共通 §2.1）が貼り付いた見出しに
//      かかったとき、**浮遊面のほうが手前に描かれる**こと（§2 の重なり順の後半）
import { screen, within } from "@testing-library/react";
import { userEvent } from "vitest/browser";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UNCATEGORIZED_LABEL } from "@/app/_lib/unset";
import { atJst } from "@/domain/shared/testing/clock";
import type { Task } from "@/domain/task/task";
import { task } from "@/domain/task/testing/task";

import { FORENOON, renderBoard, setupBoardInBrowser, stickyBoard } from "../_testing/board-helpers";
import { ICON_SIZE_CSS, installGeometryStyles } from "../_testing/geometry-styles";
import { cellsOf, headingOf, isSelected, taskRows } from "../_testing/table-helpers";

vi.mock("../actions", async () => (await import("../_testing/action-mocks")).actionMocks());

setupBoardInBrowser();

/**
 * 測る対象は貼り付きそのもの（貼り付かなければ隠れようがない）なので、実物のクラス名に敷く。
 * `border-collapse` だけはクラスではなく Tailwind の preflight が与えるものだが、**セルの実高が
 * 端数を持つ条件そのもの**（FB-111）なので実物に合わせる——separate のままだと、端数が出ない
 * 楽な盤面で「積み上げが一致する」を主張することになる。
 *
 * 重なり順（§2）を測る分は z-index の3段と、**行内で位置指定を持つセルの `relative`**（行メニュー・
 * 割り当て・バンドルの道のセル等。測る点には行メニューの列を使う）。後者は重なりの相手側だが、**段に z-index が要る理由そのもの**——位置指定を持たない行は
 * どのみち貼り付いた段の下に描かれるので、敷かないと z-index を外しても「段が行より手前」が
 * 緑のまま通る（`border-collapse` と同じく、楽な盤面で主張しないための条件）
 */
installGeometryStyles(`
  .sticky { position: sticky }
  .top-0 { top: 0 }
  .z-10 { z-index: 10 }
  .z-2 { z-index: 2 }
  .z-1 { z-index: 1 }
  .relative { position: relative }
  table { border-collapse: collapse }
  ${ICON_SIZE_CSS}
`);

/** 画面をスクロールさせるための行数（viewport 800 に対して十分に長い一覧を作る） */
const ROW_COUNT = 50;
/**
 * K で戻る段数。戻る途中の行はどれも固定領域の裏から出ていなければならない。
 * **画面に残る行数より十分に多く取る**——上方向のスクロールが始まるのは画面から出てからで、
 * 行高はこの段のフォント（環境で変わる）次第。少ないと CI だけ「一度も上へ動かないまま終わる」
 */
const UP_STEPS = 45;
/** 上のうち実際に上スクロールが起きた段の下限。下回ったら、その環境では何も試せていない */
const MIN_SCROLLING_STEPS = 3;
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

/** 列見出しのセル（§2 の2段目）。9セルとも同じ `top` なので先頭で測る */
function columnHeadCell(): HTMLElement {
  const cell = document.querySelector<HTMLElement>("thead th");
  if (cell === null) throw new Error("列見出しが見つかりません");
  return cell;
}

/** 一覧の表の矩形（列見出しを持つ表）。表の末尾・横の範囲を測るのに使う */
function tableRect(): DOMRect {
  return columnHeadCell().closest("table")!.getBoundingClientRect();
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
async function renderAndSettle(
  over: Parameters<typeof renderBoard>[1] = {},
  tasks: readonly Task[] = manyTasks()
) {
  renderBoard(tasks, over);
  await expect.poll(sectionHeadTop).toBeGreaterThan(0);
}

/**
 * 警告バナー（§8）に出す放置タスク。**種別は1つで足りる**——どちらが入っても板が高くなる
 * という幾何の仕組みは同じで、種別ごとの置き場は jsdom 段（`daily-board.display`）が持つ。
 * 盤面は渡された値を描くだけなので、**日付が実際に前日である必要はない**（判定はサーバ側）
 */
const STALE_RUNNING = task({ id: ROW_COUNT + 1, name: "放置された読書", startedAt: atJst("23:00") });

/** バナー本体（§8）。リンクを持つ要素の親＝バナーの箱 */
function staleRunningBanner(): HTMLElement {
  const banner = screen.getByRole("link", { name: "該当日を開く" }).parentElement;
  if (banner === null) throw new Error("警告バナーが見つかりません");
  return banner;
}

/** 最終行まで下る（`moveSelection` は端で止まるので、行数ぶん押せば必ず最後に着く。§5） */
async function pressDownToLastRow() {
  await userEvent.keyboard("j".repeat(ROW_COUNT));
}

// ページのスクロール位置は文書に残るので、次のテストの幾何を狂わせないよう毎回戻す
afterEach(() => window.scrollTo(0, 0));

describe("選択行のスクロール追従（画面定義書01 §5: 固定見出しの裏に隠さない。ブラウザ段）", () => {
  /**
   * 貼り付かなければ行は隠れようがなく、以下はどれも何も試していないことになる。
   * **3段を継ぎ目でつなげて見る**のが要点——見出しの `top` は板の実測高さから来るインライン
   * style なので、**板が固定を失っても見出しの位置も `scroll-margin-top` も変わらず**、
   * 下端1点だけを見る主張はすべて緑のまま通ってしまう（そのとき画面では板が流れ去り、
   * 空いた上部を裏の行が流れる ＝ FB-77 / FB-111 の症状そのもの）
   */
  it("段の前提: 3段が画面上端から隙間なく貼り付いている（§2: 板 → 列見出し → セクション見出し）", async () => {
    await renderAndSettle();
    window.scrollTo(0, SCROLLED);

    const board = stickyBoard().getBoundingClientRect();
    const columnHead = columnHeadCell().getBoundingClientRect();
    const sectionHead = headingOf(UNCATEGORIZED_LABEL).getBoundingClientRect();

    expect(board.top).toBeCloseTo(0, 1);
    expect(columnHead.top).toBeCloseTo(board.bottom, 1);
    expect(sectionHead.top).toBeCloseTo(columnHead.bottom, 1);
  });

  it("積み上げた3段の高さが実際の固定領域と一致する（§2 / FB-77）", async () => {
    await renderAndSettle();
    window.scrollTo(0, SCROLLED);

    // 板＋列見出し＋セクション見出しの積み上げ（＝§5 の停止位置）と、貼り付いた見出しの実際の下端。
    // ここがずれたまま追従だけ合わせても、行は見出しの裏に入る
    expect(fixedAreaBottom()).toBeCloseTo(scrollMarginTop(), 1);
  });

  /**
   * バナーは板の一部（§2 / FB-116）。**板が高くなっても3段の継ぎ目が保たれるか**をここで測る——
   * jsdom はレイアウトを持たないので、板の実測がバナーぶんを含んでいるかは誰も確かめられない
   * （`absolute` / `h-0` / 板への固定高や `overflow-hidden` はどれも実測をバナーぶん取りこぼし、
   * 列見出しがバナーの上に貼り付いて**バナーが隠れる** ＝ FB-116 の症状の再発）。
   * バナーの無い盤面は上の2件が見ているので、ここは**出ている盤面1つ**で足りる
   */
  it("警告バナーが出ても板ごと貼り付き、バナーは画面内に残る（§2 / FB-116）", async () => {
    await renderAndSettle({ staleRunningTask: STALE_RUNNING });
    window.scrollTo(0, SCROLLED);

    const board = stickyBoard().getBoundingClientRect();
    const banner = staleRunningBanner().getBoundingClientRect();
    const columnHead = columnHeadCell().getBoundingClientRect();

    // 前提: スクロールしており、板は貼り付いている（貼り付いていなければ以下は何も試していない）
    expect(window.scrollY).toBe(SCROLLED);
    expect(board.top).toBeCloseTo(0, 1);

    // バナーが画面内に残っている（FB-116 の症状の直訳）
    expect(banner.top).toBeGreaterThanOrEqual(-EPSILON);
    expect(banner.bottom).toBeLessThanOrEqual(window.innerHeight + EPSILON);
    expect(banner.height).toBeGreaterThan(0); // 高さを潰して「内側にある」だけ満たす経路を塞ぐ

    // 列見出しはバナーの上ではなく板の下端へ貼り付く（＝実測がバナーぶんを含んでいる）
    expect(columnHead.top).toBeCloseTo(board.bottom, 1);
    expect(columnHead.top).toBeGreaterThanOrEqual(banner.bottom - EPSILON);
    // 高くなった板のぶんも §5 の停止位置に反映されている（FB-77 の退行）
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
    expect(window.scrollY).toBeGreaterThan(0); // 前提: 下へスクロールしている

    // 1段ずつ戻す。上へはみ出した行を見せるたびに、停止位置が固定領域を避けているかを見る。
    // 崩れた段は**集めてから**主張する——ループ内で落とすと何段目でどれだけ崩れたかが残らない
    const problems: string[] = [];
    // 上へスクロールが起きた段の数。**画面内に残っている行へ戻るあいだは何も起きない**ので、
    // これを数えないと「一度も上へ動かないまま UP_STEPS を使い切った」空振りが緑になる
    let scrollingSteps = 0;
    for (let step = 1; step <= UP_STEPS; step++) {
      const before = window.scrollY;
      await userEvent.keyboard("k");
      if (window.scrollY < before) scrollingSteps++;

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
    // 前提: 実際に上方向のスクロールが起きた段が十分にある（無ければ何も試していない）
    expect(scrollingSteps).toBeGreaterThanOrEqual(MIN_SCROLLING_STEPS);
  });
});

/**
 * 画面上の点に**最前面で描かれている**のがどの層か（§2 の3段と、その下を流れる通常の行）。
 * `elementFromPoint` は描画順の一番上を返すので、z-index が実際に効いているかをそのまま読める
 * （クラスの有無では入れ替わりを検出できない）。どれでもなければ何に当たったかを返し、
 * 失敗を読めるようにする。
 *
 * `floating` には開いている行内の浮遊面のパネルを渡す。**行の中にある**ので、行より先に引く
 * （後に回すと浮遊面が手前でも「通常の行」と読んでしまう）
 */
function layerAt(x: number, y: number, floating?: HTMLElement): string {
  const hit = document.elementFromPoint(x, y);
  if (hit === null) return "（何も無い）";
  if (floating?.contains(hit) === true) return "浮遊面";
  if (stickyBoard().contains(hit)) return "板";
  if (hit.closest("thead") !== null) return "列見出し";
  // 未分類以外の見出しも同じ位置に重なって残りうる（§2 / 決定ログ 2026-08-27）ので、
  // 表の本体で唯一貼り付くセル＝`sticky` を持つ td で引く
  if (hit.closest("td")?.classList.contains("sticky") === true) return "セクション見出し";
  const tr = hit.closest("tr");
  if (tr !== null && taskRows().includes(tr)) return "通常の行";
  return `想定外の要素 <${hit.tagName.toLowerCase()}>`;
}

/** 行メニューの列（行の末尾セル）の中心 x。**`relative` を持つセルの上で測る**（敷く CSS の JSDoc） */
function rowMenuColumnX(): number {
  const rect = cellsOf(taskRows()[0]!).menu.getBoundingClientRect();
  return rect.left + rect.width / 2;
}

/** 高さ y の位置をタスク行が流れているか。無ければ、その点では行との重なりを試せていない */
function hasRowAcross(y: number): boolean {
  return taskRows().some((tr) => {
    const rect = tr.getBoundingClientRect();
    return rect.top <= y && y < rect.bottom;
  });
}

/** 縦の範囲の中心 */
function middleOf(range: Readonly<{ top: number; bottom: number }>): number {
  return (range.top + range.bottom) / 2;
}

describe("固定領域の重なり順（§2: 板 > 列見出し > セクション見出し > 通常の行。ブラウザ段 / T-144）", () => {
  /**
   * 敷いた z-index と `relative` が実物に当たっていること。実装がクラスを変える（`z-[2]` 等）と
   * ここが先に落ちる——当たらないまま下を測ると、z-index の無い盤面の重なりを主張することになる。
   * **値は見ない**（`auto` でないことだけ）。どの値なら正しいかは下の実測が持つ——ここで数字を
   * 突き合わせると、入れ替えの変異がすべてここで落ち、実測が効いているのかが読めなくなる。
   * 行メニューのセルの `relative` は測る点の真下にあるものとして見ている。実装が位置指定を
   * セルから内側の要素へ移しただけでここが落ちたら、**行に位置指定を持つ要素があれば
   * 下の主張は意味を保つ**ので、見る要素を移せばよい
   */
  it("段の前提: 3段に z-index が、行メニューのセルに位置指定が効いている", async () => {
    await renderAndSettle();

    const hasZIndex = (el: HTMLElement) => getComputedStyle(el).zIndex !== "auto";
    expect({
      板: hasZIndex(stickyBoard()),
      列見出し: hasZIndex(columnHeadCell()),
      セクション見出し: hasZIndex(headingOf(UNCATEGORIZED_LABEL)),
      行メニューのセル: getComputedStyle(cellsOf(taskRows()[0]!).menu).position,
    }).toEqual({
      板: true,
      列見出し: true,
      セクション見出し: true,
      行メニューのセル: "relative",
    });
  });

  /**
   * 3段それぞれの下を行が流れている状態で、段の中心に何が描かれているかを見る。
   * **位置指定を持つ行メニューのセルは DOM 順で段より後ろ**なので、段の z-index が欠ける・
   * 行以下に落ちると、そのセルが段の上に描かれる（行メニューが見出しや板に被って見える）
   */
  it("貼り付いた3段はどれも、下を流れる行より手前に描かれる", async () => {
    await renderAndSettle();
    window.scrollTo(0, SCROLLED);

    const x = rowMenuColumnX();
    const ys = {
      板: middleOf(stickyBoard().getBoundingClientRect()),
      列見出し: middleOf(columnHeadCell().getBoundingClientRect()),
      セクション見出し: middleOf(headingOf(UNCATEGORIZED_LABEL).getBoundingClientRect()),
    };

    // 前提: どの段の下にも行が流れている（流れていなければ重なりを試せていない）
    for (const [layer, y] of Object.entries(ys)) {
      expect(hasRowAcross(y), `${layer}の下に行が無い`).toBe(true);
    }
    expect({
      板: layerAt(x, ys.板),
      列見出し: layerAt(x, ys.列見出し),
      セクション見出し: layerAt(x, ys.セクション見出し),
    }).toEqual({
      板: "板",
      列見出し: "列見出し",
      セクション見出し: "セクション見出し",
    });
  });

  /**
   * 3段どうしの順序（`z-10 > z-2 > z-1`）。貼り付いている間の3段は縦に並んで重ならないので、
   * **重なるのは表の末尾が固定領域へ差しかかったときだけ**——列見出しとセクション見出しの貼り付きは
   * 表に閉じ込められ、表の下端に押し上げられて上の段へ潜り込む（板の閉じ込め先は表を包む外側の箱で、
   * 表の下端が板の下端より下にあるうちは押し上げられない。下の前提がそれを確かめる）。
   * 実物の画面は一覧の下に余白しか無くそこまで送れないので、**表の後ろに viewport 1枚ぶんの
   * 詰め物を足して**送れるようにする。表の下端を「板の下端＋列見出しの半分」に置くと、
   * 列見出しの上半分が板に、セクション見出しが列見出しに重なる
   */
  it("表の末尾で押し上げられた段は、上の段の裏へ潜る（板 > 列見出し > セクション見出し）", async () => {
    await renderAndSettle();
    const filler = document.createElement("div");
    filler.style.height = `${window.innerHeight}px`;
    document.body.append(filler);

    try {
      // 文書上の位置へ直す（`scrollY` を足す）。開始位置が 0 であることに頼らない
      const tableBottom = window.scrollY + tableRect().bottom;
      const boardHeight = stickyBoard().getBoundingClientRect().height;
      const columnHeadHeight = columnHeadCell().getBoundingClientRect().height;
      window.scrollTo(0, Math.round(tableBottom - (boardHeight + columnHeadHeight / 2)));

      const board = stickyBoard().getBoundingClientRect();
      const columnHead = columnHeadCell().getBoundingClientRect();
      const sectionHead = headingOf(UNCATEGORIZED_LABEL).getBoundingClientRect();

      // 2つの重なりの縦の範囲。下の側は**板の下に出ている部分だけ**を取る（板の裏は上の主張が見る）
      const upper = { top: columnHead.top, bottom: board.bottom };
      const lower = {
        top: Math.max(sectionHead.top, columnHead.top, board.bottom),
        bottom: Math.min(sectionHead.bottom, columnHead.bottom),
      };

      // 前提: 板は貼り付いたまま、2つの重なりがどちらも実際にできている（無ければ何も試していない）
      expect(board.top).toBeCloseTo(0, 1);
      expect(upper.bottom - upper.top).toBeGreaterThan(1);
      expect(lower.bottom - lower.top).toBeGreaterThan(1);

      const x = columnHead.left + columnHead.width / 2;
      expect({
        板と列見出しの重なり: layerAt(x, middleOf(upper)),
        列見出しとセクション見出しの重なり: layerAt(x, middleOf(lower)),
      }).toEqual({
        板と列見出しの重なり: "板",
        列見出しとセクション見出しの重なり: "列見出し",
      });
    } finally {
      filler.remove();
    }
  });
});

/**
 * 行内の浮遊面を測るために足して敷くもの。パネルの**位置指定**（`absolute`）は測る対象そのもの——
 * 位置指定の無い要素には z-index が効かず、パネルは行と一緒に見出しの裏を流れるだけになる
 * （敷かないと、パネルの z-index を落としても上げても同じ盤面を測ることになる）。z-index は
 * ファイル先頭で敷いた `.z-10` がそのまま当たる。
 *
 * パネルに付く他の位置指定（`right-0`・反転時の `bottom-full`）と余白（`mt-1`）は敷かない——
 * 測るのはどれが手前かだけで、パネルの水平位置は測る点の取り方（パネルの実測から引く）で吸収する。
 * 向きのクラスを敷かないので、**パネルは反転の判定に関わらず静的な位置（ボタンの直後＝行の中から
 * 下へ）に出る**。**この describe にだけ敷く**のは、上の3段の主張を `absolute` の無い盤面のまま
 * 保つため。
 *
 * 射程: 浮遊面の z-index が見出しと競るのは、パネルの先祖（`relative` のセル・枠）が重なりの文脈
 * （stacking context）を作っていないから。**先祖に `isolate`・`opacity-*`・`transform` 系が付いて
 * パネルが閉じ込められる退行は、それらを敷いていないので測れない**（代表を1か所に絞れるのも
 * この前提があるから）
 */
const FLOATING_CSS = ".absolute { position: absolute }";

/**
 * パネルと相手が画面内で横に重なる範囲の幅と中点 x。パネルの水平位置は敷いていない
 * （`FLOATING_CSS` の JSDoc）ので、測る点は実測した重なりから引く。幅が無ければ何も試せていない
 */
function horizontalOverlap(
  panel: DOMRect,
  other: Readonly<{ left: number; right: number }>
): Readonly<{ x: number; width: number }> {
  const left = Math.max(panel.left, other.left);
  const right = Math.min(panel.right, other.right, window.innerWidth);
  return { x: (left + right) / 2, width: right - left };
}

/** 浮遊面のパネル。役割を持たないので、中の要素から親へ遡る */
function panelOf(inner: Element | null): HTMLElement {
  const panel = inner?.parentElement;
  if (panel === null || panel === undefined) throw new Error("浮遊面のパネルが見つかりません");
  return panel;
}

/** 行内の浮遊面の1部品と、それを行で開いてパネルを返す手順 */
type FloatingSurface = Readonly<{
  name: string;
  open: (row: HTMLElement) => Promise<HTMLElement>;
}>;

/** 選択ポップオーバー。モード・プロジェクト・セクションで同じ部品なので、代表としてモードの列で開く */
const SELECT_POPOVER: FloatingSurface = {
  name: "選択ポップオーバー（O-5）",
  open: async (row) => {
    const cell = cellsOf(row).mode;
    await userEvent.click(within(cell).getByRole("button"));
    return panelOf(cell.querySelector("[data-option-index]"));
  },
};

const ROW_MENU: FloatingSurface = {
  name: "行メニュー",
  open: async (row) => {
    await userEvent.click(within(row).getByRole("button", { name: "行メニュー" }));
    return panelOf(within(row).getByRole("button", { name: "複製" }));
  },
};

const ROUTINIZE_POPOVER: FloatingSurface = {
  name: "ルーチン化ポップオーバー（O-12）",
  open: async (row) => {
    await userEvent.click(within(row).getByRole("button", { name: "行メニュー" }));
    await userEvent.click(within(row).getByRole("button", { name: "ルーチン化" }));
    return panelOf(within(row).getByText("ルーチン化", { selector: "p" }));
  },
};

/**
 * 行内の浮遊面（画面定義書00_共通 §2.1。デイリーの行に開くもの）の全部品。
 * **z-index は各部品が自分のクラス文字列に別々に書いている**（値は同じ `z-10` だが共有していない）
 * ので、部品ごとに1件ずつ測る（1つを測っても他の部品の退行は捕まらない）
 */
const FLOATING_SURFACES: readonly FloatingSurface[] = [SELECT_POPOVER, ROW_MENU, ROUTINIZE_POPOVER];

/** 2グループの盤面の各グループの行数。未分類の末尾行のパネルが次の見出しまで垂れ、なお送れる長さ */
const ROWS_PER_GROUP = 25;

/** 未分類と午前の2グループに積んだ一覧（グループの境目で、DOM 上パネルより後ろの見出しを作る） */
function twoGroupTasks(): Task[] {
  return Array.from({ length: ROWS_PER_GROUP * 2 }, (_, i) =>
    task({
      id: i + 1,
      name: `タスク${String(i + 1).padStart(2, "0")}`,
      sectionId: i < ROWS_PER_GROUP ? null : FORENOON.id,
    })
  );
}

describe("行内の浮遊面は貼り付いた見出しより手前（§2 / 画面定義書00_共通 §2.1。ブラウザ段 / T-165）", () => {
  installGeometryStyles(FLOATING_CSS);

  /**
   * 敷いた位置指定と z-index がパネルに当たっていること（上の「段の前提」と同じく値は見ない）。
   * 実装がクラスを変える（`z-[10]` 等）と当たらなくなり、下の実測は**赤になる側で**崩れる——
   * 嘘の緑にはならないが、z-index の退行か盤面の崩れかを読み分けるためにここで分ける
   */
  it.each(FLOATING_SURFACES)(
    "段の前提: $name のパネルに位置指定と z-index が効いている",
    async ({ open }) => {
      await renderAndSettle();

      const style = getComputedStyle(await open(taskRows()[0]!));

      expect({ 位置指定: style.position, z指定あり: style.zIndex !== "auto" }).toEqual({
        位置指定: "absolute",
        z指定あり: true,
      });
    }
  );

  /**
   * 開いたまま一覧を下へ送ると、パネルは行ごと固定領域の裏へ入っていく（位置は開いた直後に決めて
   * スクロールに追従しない。画面定義書00_共通 §2.1「表示位置」）。パネルの上端を列見出しの上端の
   * 1px 下まで送り（列見出し・セクション見出しの両方を覆わせる）、**両方にかかった点**で何が描かれるかを見る。
   * 2段とも測るのは、z-index が同じ値どうしは DOM 順で後ろ（＝行の中のパネル）が手前になるため——
   * パネルを `z-1` に落とす変異はセクション見出し（`z-1`）の上ではまだ手前に描かれ、列見出し
   * （`z-2`）の上でだけ裏へ潜る
   */
  it.each(FLOATING_SURFACES)(
    "$name は、かかった列見出し・セクション見出しより手前に描かれる",
    async ({ open }) => {
      await renderAndSettle();
      window.scrollTo(0, SCROLLED);
      // 固定領域のすぐ下に見えている行で開く（パネルは行の中から下へ出る。`FLOATING_CSS` の JSDoc）
      const fixedBottom = fixedAreaBottom();
      const row = taskRows().find((tr) => tr.getBoundingClientRect().top >= fixedBottom - EPSILON);
      if (row === undefined) throw new Error("固定領域の下に見えている行がありません");
      const panel = await open(row);

      // 列見出しは貼り付いているので、送る前後で上端は変わらない（送った後の前提で確かめる）
      const columnHeadEl = columnHeadCell();
      const shift = panel.getBoundingClientRect().top - (columnHeadEl.getBoundingClientRect().top + 1);
      window.scrollBy(0, Math.round(shift));

      const board = stickyBoard().getBoundingClientRect();
      const columnHead = columnHeadEl.getBoundingClientRect();
      const sectionHead = headingOf(UNCATEGORIZED_LABEL).getBoundingClientRect();
      const panelBox = panel.getBoundingClientRect();
      const ys = { 列見出し: middleOf(columnHead), セクション見出し: middleOf(sectionHead) };
      // 列見出しのセルは列ごとに分かれているので、横の範囲は表で取る（セクション見出しは全列に渡る）
      const across = horizontalOverlap(panelBox, tableRect());

      // 前提: 2段とも貼り付いたまま、パネルが両方の測る点を覆っている（無ければ何も試していない）
      expect(board.top).toBeCloseTo(0, 1);
      expect(columnHead.top).toBeCloseTo(board.bottom, 1);
      expect(sectionHead.top).toBeCloseTo(columnHead.bottom, 1);
      expect(panelBox.top).toBeLessThan(ys.列見出し);
      expect(panelBox.bottom).toBeGreaterThan(ys.セクション見出し);
      expect(across.width).toBeGreaterThan(1);

      expect({
        列見出し: layerAt(across.x, ys.列見出し, panel),
        セクション見出し: layerAt(across.x, ys.セクション見出し, panel),
      }).toEqual({ 列見出し: "浮遊面", セクション見出し: "浮遊面" });
    }
  );

  /**
   * 上の盤面（1グループ）では見出しがどれも DOM 上でパネルより前にあり、z-index が同値なら
   * DOM 順でパネルが勝つ——**見出しを浮遊面と同値以上に上げる退行がそこでは測れない**。
   * グループの境目なら、前のグループの末尾行で開いたパネルが、DOM 上パネルより**後ろ**にある
   * 次の見出しへ垂れる。その見出しを貼り付く位置まで送り、パネルがかかった点を見る。
   * z-index の退行は上の部品ごとのケースが見ているので、ここは代表1部品（行メニュー）で足りる
   */
  it("グループの境目で、DOM 上パネルより後ろの見出しが貼り付いても浮遊面が手前に描かれる", async () => {
    await renderAndSettle({}, twoGroupTasks());
    const nextHeading = headingOf(FORENOON.name);
    const lastInboxRow = taskRows()[ROWS_PER_GROUP - 1]!;

    // 未分類の末尾行を固定領域のすぐ下へ出して開く（見えていない行はクリックできない）
    window.scrollTo(0, SCROLLED);
    const fixedBottom = fixedAreaBottom();
    window.scrollBy(0, Math.round(lastInboxRow.getBoundingClientRect().top - (fixedBottom + 1)));
    const panel = await ROW_MENU.open(lastInboxRow);

    // 次の見出しを、貼り付く位置の 2px 先まで送る（＝貼り付いた状態にする）
    const stuckTop = Number.parseFloat(nextHeading.style.top);
    window.scrollBy(0, Math.round(nextHeading.getBoundingClientRect().top - (stuckTop - 2)));

    const heading = nextHeading.getBoundingClientRect();
    const panelBox = panel.getBoundingClientRect();
    const y = middleOf(heading);
    const across = horizontalOverlap(panelBox, heading);

    // 前提: 見出しは DOM 上パネルより後ろにあり、貼り付いていて、パネルがその測る点を覆っている
    expect(panel.compareDocumentPosition(nextHeading) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
    expect(heading.top).toBeCloseTo(stuckTop, 1);
    expect(panelBox.top).toBeLessThan(y);
    expect(panelBox.bottom).toBeGreaterThan(y);
    expect(across.width).toBeGreaterThan(1);

    expect(layerAt(across.x, y, panel)).toBe("浮遊面");
  });
});
