// 盤面テスト（`daily-board.*.test.tsx`）のうち**操作を伴わない表示と配線**を持つファイル
// （§2 / §3.1 / §3.2 / §3.3 / §4.3 / F-116 / F-121 / F-209）。現在セクションの導出、
// 固定領域の高さの計測、表示日に応じた「今日へ」の出し分け、放置タスクの警告バナー、日界の配線。
// 主題は**描いた結果と、board が導出して配れているか**——操作を起点にするテストは他の5ファイルへ。
import { act, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import type { Section } from "@/domain/section/section";
import { addDays } from "@/domain/shared/logical-date";
import { atJst, NEXT_TEST_DATE, TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";

import { SECTIONS } from "../_testing/factories";
import {
  defaultTasks,
  FORENOON,
  NOT_STARTED,
  renderBoard,
  RUNNING,
  setupBoard,
} from "../_testing/board-helpers";
import { ResizeObserverStub } from "@/app/_testing/resize-observer";
import { summaryValueOf } from "../_testing/summary-helpers";
import { cellsOf, headingOf, taskRow, taskRows } from "../_testing/table-helpers";

vi.mock("../actions", async () => (await import("../_testing/action-mocks")).actionMocks());

setupBoard();

/**
 * 上部の板（§2 の固定領域。h1・日付ナビ＋サマリ・クイック追加欄と、出ていれば §8 の警告バナー）。
 * 列見出しとセクション見出しはこの高さを起点に積まれるので、高さを動かすテストはこの要素で
 * `ResizeObserver` を引く。
 *
 * **貼り付いていることを前提として確かめる**——板の `div` ごと外して子を持ち上げる変異が起きると
 * h1 の親は RTL のコンテナ（リストも含む要素）になり、「板の中にある」を見るテストが揃って
 * 偽の緑になる。固定は §2 の条項そのものなので、ここで1度だけ押さえる
 */
function stickyBoard(): HTMLElement {
  const board = screen.getByRole("heading", { name: "デイリー" }).parentElement;
  if (board === null) throw new Error("上部の板が見つかりません");
  if (!board.classList.contains("sticky")) throw new Error("上部の板が固定されていません（§2）");
  return board;
}

/** クイック追加欄（§3.4）。板の中での前後関係を測る基準に使う */
function quickAddInput(): HTMLElement {
  return screen.getByPlaceholderText("タスク名を入力して Enter で追加");
}

/** 上部の板を観測している ResizeObserver。無ければ計測そのものが配線されていない */
function stickyObserver(): ResizeObserverStub {
  return ResizeObserverStub.observing(stickyBoard());
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
    renderBoard(defaultTasks(), { date: "2026-07-20", today: TEST_DATE });

    expect(highlightedSectionNames()).toEqual([]);
  });

  it("未来日でも強調しない（残り時間 F-110 と違って未来へは広げない。§3.2 / FB-104）", () => {
    renderBoard(defaultTasks(), { date: NEXT_TEST_DATE, today: TEST_DATE });

    expect(highlightedSectionNames()).toEqual([]);
  });

  // 候補の中身（固定項目の文言・並び）は `_lib/section-options.test.ts` と `daily-list.test.tsx` が
  // 持つ。盤面が `currentSectionId` を渡しているかは、上の見出しの強調が同じ導出で落ちる
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

  /**
   * 一枚板（§2）。板とリストの境界を示す罫線は**列見出しの下端に1本だけ**で、板の下端には
   * 引かない（3段の固定で線が並ばないように）。列見出し側が持っていることは daily-list.test.tsx が見る
   */
  it("板の下端に罫線を引かない（境界は列見出しの下罫線が示す。§2）", () => {
    renderBoard();

    expect(stickyBoard().classList.contains("border-b")).toBe(false);
  });

  // 列見出し・セクション見出しぶんを足した積み上げはリスト側の仕事なので daily-list.test.tsx が見る
  // （jsdom ではどちらも高さ 0 なので、ここでは板の高さがそのまま行へ届く）
  it("板の実測した高さを全行の scroll-margin へ配り、変化のたびに追う", () => {
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

describe("DailyBoard の表示日に応じた出し分けと警告（§2 / §3.1 / §3.2 / §8 / F-124 / F-209）", () => {
  /**
   * 前日から実行中のまま残ったタスク（§8 / F-209）。**前日であることは盤面の関心ではない**——
   * 放置かどうかの判定はサーバ側で、盤面は渡された値を描くだけ。それでも日付を前日に採るのは、
   * バナーに出る日付が表示日（`TEST_DATE`）と同じだと**取り違えた変異に気づけない**ため
   */
  const PREVIOUS_DATE = addDays(TEST_DATE, -1);
  const staleRunning = () =>
    task({ id: 5, name: "読書", taskDate: PREVIOUS_DATE, startedAt: atJst("23:00", PREVIOUS_DATE) });

  // 移動先が S-04（/review）になっていないことは href でしか判らない（画面定義書04 §3.1
  // 「S-01 と S-04 の表示日は連動させない」の S-01 側。04 の対は review-board.test.tsx）
  it("日付ナビの移動先は S-01 に閉じる（前日・翌日・今日へ）", () => {
    renderBoard(defaultTasks(), { date: "2026-07-20", today: TEST_DATE });

    expect(screen.getByLabelText("前日").getAttribute("href")).toBe("/?date=2026-07-19");
    expect(screen.getByLabelText("翌日").getAttribute("href")).toBe("/?date=2026-07-21");
    expect(screen.getByText("今日へ").getAttribute("href")).toBe("/");
  });

  /**
   * board が導く「表示日は今日か」（`date === today`）の配り先は、現在セクション（上の describe）と
   * DateNav・DailySummary・DailyList。**子への配線は1件ずつ置く**——まとめると片方を壊しても
   * もう片方が緑のまま残る（日界の配線と同じ流儀。下の describe）。
   * DateNav は否定側で見る——「今日以外なら出す」側は、上の日付ナビの href を読むテストが
   * `isToday` を固定する変異で同時に落ちるため
   */
  it("今日を表示中は「今日へ」を出さない（DateNav への配線。§3.1）", () => {
    renderBoard();

    expect(screen.queryByRole("link", { name: "今日へ" })).toBeNull();
  });

  // 曜日は表示日から導く（§3.1 の日付表示 `YYYY-MM-DD(曜)`。F-106）。`DateNav` は受け取った
  // index を描くだけなので、**導出しているか**はこの画面でしか見えない。TEST_DATE は日曜＝
  // index 0 で「渡し忘れて 0 になる」退行と見分けがつかないため、**別の曜日の日付**で見る
  it("日付ラベルの曜日は表示日から導く（DateNav への配線。§3.1 / F-106）", () => {
    renderBoard(defaultTasks(), { date: NEXT_TEST_DATE, today: TEST_DATE });

    expect(screen.queryByText(`${NEXT_TEST_DATE}(月)`)).not.toBeNull();
  });

  // 出す・出さないの規則そのものは子の段（daily-summary / daily-list）が持つ。ここで見るのは
  // **board が「今日ではない」を配れているか**——渡す値を true に固定しても子の段は緑のまま通る
  it("今日以外を表示中はサマリの終了予定を出さない（DailySummary への配線。§3.1）", () => {
    renderBoard(defaultTasks(), { date: "2026-07-20", today: TEST_DATE });

    expect(screen.queryByText("終了予定")).toBeNull();
  });

  it("今日以外を表示中は予想開始も出さない（DailyList への配線。§3.3）", () => {
    renderBoard(defaultTasks(), { date: "2026-07-20", today: TEST_DATE });

    expect(cellsOf(taskRow(NOT_STARTED)).time.textContent).toBe("");
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
    });

    // 午前は 09:00–13:00 の4時間。今日（NOW = 10:30）の枠を測ってしまうと +25:30 になる
    expect(headingOf(FORENOON.name).textContent).toContain("残り +3:00");
  });

  it("前日以前の実行中タスクがあれば警告バナーを出す（F-209）", () => {
    renderBoard(defaultTasks(), { staleRunningTask: staleRunning() });

    expect(screen.queryByText("読書")).not.toBeNull();
    expect(screen.queryByRole("link", { name: "該当日を開く" })).not.toBeNull();
  });

  it("放置がなければバナーは出さない", () => {
    renderBoard();

    expect(screen.queryByRole("link", { name: "該当日を開く" })).toBeNull();
  });

  // 日付書式・件数・href は部品のテスト（stale-unstarted-banner.test.tsx）が持つ。ここは配線だけ見る
  it("前日以前に未実行タスクが残っていれば警告バナーを出す（F-124）", () => {
    renderBoard(defaultTasks(), {
      staleUnstartedCounts: [{ taskDate: "2026-07-23", count: 2 }],
    });

    expect(screen.queryByRole("link", { name: "2026-07-23(木)" })).not.toBeNull();
  });

  it("前日以前の未実施タスクが無ければバナーは出さない", () => {
    renderBoard(defaultTasks(), { staleUnstartedCounts: [] });

    expect(screen.queryByText(/前日以前に未実施のタスク/)).toBeNull();
  });

  it("実行中の放置（F-209）と同時に出るときは F-209 を上に置く（§8: 終了打刻の失念の方が急ぐ）", () => {
    renderBoard(defaultTasks(), {
      staleRunningTask: staleRunning(),
      staleUnstartedCounts: [{ taskDate: "2026-07-23", count: 2 }],
    });

    const running = screen.getByRole("link", { name: "該当日を開く" });
    const unstarted = screen.getByRole("link", { name: "2026-07-23(木)" });
    // DOCUMENT_POSITION_FOLLOWING: 比較相手（unstarted）が自分（running）より後にある
    expect(running.compareDocumentPosition(unstarted) & Node.DOCUMENT_POSITION_FOLLOWING).not.toBe(0);
  });

  /**
   * バナーの置き場（§2 / FB-116）。ここが見るのは**構造**だけ——スクロールしても流れないこと
   * そのもの（幾何）はブラウザ段（`daily-board.scroll.browser.test.tsx`）が測る。
   *
   * **2種別それぞれに置く**——片方だけ板へ入れた状態は、上の「同時に出るときの並び」では
   * 緑のまま通る。リストが板の外にあることを併せて見るのは、板の `div` ごと外す変異で
   * 包含が自明に真になる経路を塞ぐため
   */
  it("実行中の放置の警告を板の中に置く（§2: 板の外はスクロールで流れる）", () => {
    renderBoard(defaultTasks(), { staleRunningTask: staleRunning() });

    expect(stickyBoard().contains(screen.getByRole("link", { name: "該当日を開く" }))).toBe(true);
    expect(stickyBoard().contains(taskRow(RUNNING))).toBe(false);
  });

  it("未実施の残りの警告も板の中に置く（§2: 板の外はスクロールで流れる）", () => {
    renderBoard(defaultTasks(), { staleUnstartedCounts: [{ taskDate: "2026-07-23", count: 2 }] });

    expect(stickyBoard().contains(screen.getByRole("link", { name: "2026-07-23(木)" }))).toBe(true);
    expect(stickyBoard().contains(taskRow(RUNNING))).toBe(false);
  });

  /**
   * 板の**最下段**（§2）。板の上端（h1 の上）に出す案は log_01 2026-09-24 で却下している
   * （警告の有無で h1・日付ナビ・クイック追加欄という毎日使う並びが上下に動くため）が、
   * 「板の中」だけを見る上の2件はその案へ戻る変異を捕まえられない
   */
  it("警告はクイック追加欄より後ろに置く（§2: 板の最下段）", () => {
    renderBoard(defaultTasks(), { staleRunningTask: staleRunning() });

    const banner = screen.getByRole("link", { name: "該当日を開く" });
    expect(quickAddInput().compareDocumentPosition(banner) & Node.DOCUMENT_POSITION_FOLLOWING)
      .not.toBe(0);
  });
});

/**
 * 日界そのものの導出（`dayStartTimeOf` / `offsetFromDayStart`）は domain 段が持つ。
 * ここで見るのは **board が導出した日界を子へ配れているか**——サマリとリストは別々に受け取るので
 * 配線ごとに1件ずつ置く（片方を壊しても もう片方は緑になる）。
 *
 * 差が出るのは**深夜側（日界より前）を表示しているとき**だけなので、盤面ごと専用に組む。
 * 既定の `SECTIONS` を触らないのは、見出しの数と現在セクションが動いて他のテストの前提を壊すため
 */
describe("DailyBoard の日界の配線（F-116 / §3.1 / §3.3: 日またぎは論理日の区切りで測る）", () => {
  /** 日界を持たないセクション群（＝日界 00:00）。既定の `SECTIONS` は「朝 06:00」を日界に持つ */
  const SECTIONS_WITHOUT_DAY_START = SECTIONS.map((s) => ({ ...s, isDayStart: false }));

  /**
   * 論理日 TEST_DATE のリストを深夜 02:00（＝日界 06:00 の手前）に開き、3時間ぶんの未実行を積む。
   * 終了予定は暦日 07-27 の 05:00 ＝ 日界 06:00 なら「まだ論理日 07-26 の続き」
   */
  function renderLateNightBoard(sections: readonly Section[]): void {
    vi.setSystemTime(atJst("02:00", NEXT_TEST_DATE));
    renderBoard([task({ id: 9, name: NOT_STARTED, estimateMinutes: 180 })], { sections });
  }

  it("日界 06:00 なら終了予定を翌暦日として出す（DailySummary への配線）", () => {
    renderLateNightBoard(SECTIONS);

    expect(summaryValueOf("終了予定")).toBe("翌 5:00");
  });

  it("日界 06:00 なら予想開始も翌暦日として出す（DailyList への配線。§3.3）", () => {
    renderLateNightBoard(SECTIONS);

    expect(cellsOf(taskRow(NOT_STARTED)).time.textContent).toBe("翌 02:00–");
  });

  /**
   * 日界だけを外した対照。**この盤面は本番では起こらない**（日界 00:00 なら深夜 02:00 の論理日は
   * 07-27 なので `isToday` は false になる）が、`dayStartMinutes` 以外を固定して差の出どころを
   * 1つに絞るために既定のまま描く
   */
  it("日界を持たなければ同じ盤面はどちらも当日の時刻", () => {
    renderLateNightBoard(SECTIONS_WITHOUT_DAY_START);

    expect(summaryValueOf("終了予定")).toBe("5:00");
    expect(cellsOf(taskRow(NOT_STARTED)).time.textContent).toBe("02:00–");
  });
});
