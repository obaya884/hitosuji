// 盤面テスト（`daily-board.*.test.tsx`）のうち**操作を伴わない表示と配線**を持つファイル
// （§2 / §3.1 / §3.2 / §4.3 / F-121 / F-209）。現在セクションの導出、固定領域の高さの計測、
// 表示日に応じた「今日へ」の出し分け、放置タスクの警告バナー。
// 主題は**描いた結果と、board が導出して配れているか**——操作を起点にするテストは他の5ファイルへ。
// 唯一の例外はセクション候補の並び（`s` で開かないと読めないため、開く操作だけを使う）。
import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { atJst, NEXT_TEST_DATE, TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";

import { SECTIONS } from "../_testing/factories";
import {
  defaultTasks,
  FORENOON,
  NOT_STARTED,
  press,
  renderBoard,
  ResizeObserverStub,
  RUNNING,
  selectRow,
  setupBoard,
} from "../_testing/board-helpers";
import { headingOf, popoverLabels, taskRows } from "../_testing/table-helpers";

vi.mock("../actions", async () => (await import("../_testing/action-mocks")).actionMocks());

setupBoard();

/** 固定領域を観測している ResizeObserver。無ければ計測そのものが配線されていない */
function stickyObserver(): ResizeObserverStub {
  if (ResizeObserverStub.latest === null) throw new Error("ResizeObserver が生成されていません");
  return ResizeObserverStub.latest;
}

describe("DailyBoard の現在セクションの導出（§3.2 F-121 の強調 / §4.3 の固定候補）", () => {
  /**
   * 「だけ」を主張するので**有効セクションを全部見る**（強調された見出しの一覧で照合する）。
   * 個別の見出しを名指しで数えると、フィクスチャにセクションが増えたぶんが検査から漏れる。
   * アーカイブ済みは当日タスクが属さない限り見出しが出ない（§3.2）ので母集団から外す
   */
  const highlightedSectionNames = () =>
    SECTIONS.filter((s) => !s.isArchived)
      .filter((s) => headingOf(s.name).classList.contains("bg-band-now"))
      .map((s) => s.name);

  it("現在時刻を含むセクションの見出しだけ強調する（F-121）", () => {
    renderBoard(); // NOW = 10:30 → 午前

    expect(highlightedSectionNames()).toEqual([FORENOON.name]);
  });

  it("表示日が過去ならどのセクションも強調しない（F-121）", () => {
    renderBoard(defaultTasks(), { date: "2026-07-20", today: TEST_DATE, isToday: false });

    expect(highlightedSectionNames()).toEqual([]);
  });

  it("未来日でも強調しない（残り時間 F-110 と違って未来へは広げない。§3.2 / FB-104）", () => {
    renderBoard(defaultTasks(), { date: NEXT_TEST_DATE, today: TEST_DATE, isToday: false });

    expect(highlightedSectionNames()).toEqual([]);
  });

  it("セクション選択の候補先頭に「現在のセクションへ」を出す（O-5 / §4.3）", () => {
    renderBoard();
    selectRow(NOT_STARTED);

    press("s");

    expect(popoverLabels()[0]).toBe(`現在のセクションへ（${FORENOON.name}）`);
  });
});

// 実測（board）と `scroll-margin` への写像（task-row）は各段が持つが、その中間——
// 測った値が行まで届くか——はここでしか見られない
describe("DailyBoard の固定領域の高さ（§2 / §5: 追従した行が固定領域の裏に隠れないようにする）", () => {
  /** 行ごとの写像は task-row.test.tsx が持つので、ここで見るのは「全行に同じ値が届いたか」 */
  const scrollMargins = () => new Set(taskRows().map((tr) => tr.style.scrollMarginTop));

  /**
   * 現在地（実行中タスク＝初期選択）にコメントを付けた盤面。コメント行（O-16）は選択行の
   * 直下に出るがタスク行ではなく scroll-margin を持たないので、**タスク行の数え方を緩めると
   * 集合に "" が混ざって落ちる**——数え方そのものをここで固定する
   */
  const tasksWithCommentRow = () =>
    defaultTasks().map((t) => (t.name === RUNNING ? { ...t, comment: "延びた" } : t));

  it("実測した高さを全行の scroll-margin へ配り、変化のたびに追う", () => {
    renderBoard(tasksWithCommentRow());
    expect(taskRows()).toHaveLength(3); // コメント行はタスク行に数えない
    expect(scrollMargins()).toEqual(new Set(["0px"])); // 実測が届く前は 0

    act(() => stickyObserver().resizeTo(96));

    expect(scrollMargins()).toEqual(new Set(["96px"]));

    // ResizeObserver を使う意味は「変わり続けても追う」こと。初回だけ measure する実装では通らない
    act(() => stickyObserver().resizeTo(120));

    expect(scrollMargins()).toEqual(new Set(["120px"]));
  });
});

describe("DailyBoard の表示日に応じた出し分けと警告（§3.1 / §3.2 / F-209）", () => {
  // 移動先が S-04（/review）になっていないことは href でしか判らない（04 §3.1
  // 「S-01 と S-04 の表示日は連動させない」の S-01 側。04 の対は review-board.test.tsx）
  it("日付ナビの移動先は S-01 に閉じる（前日・翌日・今日へ）", () => {
    renderBoard(defaultTasks(), { date: "2026-07-20", today: TEST_DATE, isToday: false });

    expect(screen.getByLabelText("前日").getAttribute("href")).toBe("/?date=2026-07-19");
    expect(screen.getByLabelText("翌日").getAttribute("href")).toBe("/?date=2026-07-21");
    expect(screen.getByText("今日へ").getAttribute("href")).toBe("/");
  });

  it("今日以外を表示中は「今日へ」を出す（isToday の配線。§3.1）", () => {
    renderBoard(defaultTasks(), { date: "2026-07-20", today: TEST_DATE, isToday: false });

    expect(screen.queryByRole("link", { name: "今日へ" })).not.toBeNull();
  });

  it("今日を表示中は「今日へ」を出さない（isToday の配線。§3.1）", () => {
    renderBoard();

    expect(screen.queryByRole("link", { name: "今日へ" })).toBeNull();
  });

  /**
   * 残り時間の値も表示条件も projection / daily-list の段が持つ。ここで見るのは
   * **board が `date` と「今日・未来日のどちらか」を配れているか**（`today` との比較は board にしかない）。
   * 過去日側をここに置かないのは、`NOW` を固定している以上どんな過去日でも枠が既に終わっており、
   * 「now < 枠の終了」の絞り込みだけで消えて board の配線を観測できないため（判定は daily-list.test.tsx）
   */
  it("未来日でも残り時間を出す。枠は表示日に敷く（§3.2 / FB-104）", () => {
    renderBoard([task({ id: 9, name: "資料作成", sectionId: FORENOON.id, estimateMinutes: 60 })], {
      date: NEXT_TEST_DATE,
      today: TEST_DATE,
      isToday: false,
    });

    // 午前は 09:00–13:00 の4時間。今日（NOW = 10:30）の枠を測ってしまうと +25:30 になる
    expect(headingOf(FORENOON.name).textContent).toContain("残り +3:00");
  });

  it("前日以前の実行中タスクがあれば警告バナーを出す（F-209）", () => {
    renderBoard(defaultTasks(), {
      staleRunningTask: task({
        id: 5,
        name: "読書",
        taskDate: "2026-07-25",
        startedAt: atJst("23:00", "2026-07-25"), // 前日
      }),
    });

    expect(screen.queryByText("読書")).not.toBeNull();
    expect(screen.queryByRole("link", { name: "該当日を開く" })).not.toBeNull();
  });

  it("放置がなければバナーは出さない", () => {
    renderBoard();

    expect(screen.queryByRole("link", { name: "該当日を開く" })).toBeNull();
  });
});
