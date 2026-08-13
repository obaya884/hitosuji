// 盤面テスト（`daily-board.*.test.tsx`）のうち**ショートカットの結線**を持つファイル（§5 / §6）。
// キー判定そのものは `use-daily-shortcuts` が持ち、ここが見るのは board への結線。
//
// ここが持つのは**選択の移動と並び替え**（`J`/`K`/`Shift+J`/`Shift+K`/`N`）と日付移動・ヘルプ、
// および「開いている間は背後へ流さない」というキーの遮断。
// **§6 のキーがすべてここにあるわけではない**——キーが起こす操作の主題ごとに分かれている:
// 打刻・取り消しは `punch`、削除と割り当ては `row-operations`、入力欄を開いた後の確定は
// `editing`、楽観的更新とロールバックが主題のものは `optimistic`。
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { clickWithoutServer } from "@/app/_testing/interactions";
import { otherRouterCalls, router } from "@/app/_testing/next-navigation";
import { atJst, TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";

import { deleteTaskAction, moveTaskByStepAction, type DailyActionResult } from "../actions";
import {
  AFTERNOON,
  COMPLETED,
  commentInput,
  defaultTasks,
  FORENOON,
  hold,
  INBOX,
  inboxAndSections,
  NOT_STARTED,
  OK,
  press,
  quickAddInput,
  renderBoard,
  RUNNING,
  selectRow,
  setupBoard,
} from "../_testing/board-helpers";
import { isSelected, rowNames, taskRow } from "../_testing/table-helpers";

vi.mock("../actions", async () => (await import("../_testing/action-mocks")).actionMocks());

setupBoard();

describe("DailyBoard のショートカット結線（§6。キー判定そのものは use-daily-shortcuts が持つ）", () => {
  it("Shift+J は選択タスクを1つ下へ動かし、楽観的に並べ替える", () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(moveTaskByStepAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("J", { shiftKey: true });

    expect(vi.mocked(moveTaskByStepAction)).toHaveBeenCalledWith({
      taskId: 11,
      date: TEST_DATE,
      step: 1,
    });
    expect(rowNames()).toEqual([RUNNING, NOT_STARTED, COMPLETED]);
    // 移動したタスクを選択したまま追従させる（§5 / FB-50）
    expect(isSelected(NOT_STARTED)).toBe(true);
  });

  it("並び替えが失敗したら並びを戻し、選択は移動対象に残す（N-01 / §5）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(moveTaskByStepAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("J", { shiftKey: true });
    expect(rowNames()).toEqual([RUNNING, NOT_STARTED, COMPLETED]);

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
    // 巻き戻っても選択は動かしたタスクに残る（連続 Shift+J を続けられる）
    expect(isSelected(NOT_STARTED)).toBe(true);
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
  });

  it("一度も明示選択していない状態の並び替えも対象を選択として固定する（§5 / FB-50）", () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(moveTaskByStepAction).mockReturnValue(gate.promise);
    // 初期選択は「現在地」＝先頭の未実行タスク。固定しないと移動後に選択が再導出されて別タスクへ飛ぶ
    renderBoard([
      task({ id: 21, name: "洗濯", sectionId: FORENOON.id, sortOrder: 1000 }),
      task({ id: 22, name: "掃除", sectionId: FORENOON.id, sortOrder: 2000 }),
    ]);

    press("J", { shiftKey: true });

    expect(rowNames()).toEqual(["掃除", "洗濯"]);
    expect(isSelected("洗濯")).toBe(true);
  });

  it("リスト全体の下端では並び替えない（O-6）", () => {
    renderBoard();
    selectRow(COMPLETED); // 表示順の最後尾

    press("J", { shiftKey: true });

    expect(vi.mocked(moveTaskByStepAction)).not.toHaveBeenCalled();
    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
  });

  it("リスト全体の上端でも並び替えない（O-6）", () => {
    // 上端は未分類グループ（リスト先頭。§3.2）の先頭行。セクション付きの先頭行は
    // まだ上に未分類があるので「端」ではない
    renderBoard([task({ id: 21, name: "洗濯" }), ...defaultTasks()]);
    selectRow("洗濯");

    press("K", { shiftKey: true });

    expect(vi.mocked(moveTaskByStepAction)).not.toHaveBeenCalled();
    expect(rowNames()).toEqual(["洗濯", NOT_STARTED, RUNNING, COMPLETED]);
  });

  it("Shift+J はセクションを跨いで移動する（O-6。並びが同じでも所属が変わる）", () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(moveTaskByStepAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(RUNNING); // 午前グループの最終行

    press("J", { shiftKey: true });

    // 表示順は隣接したままだが、行のセクション表記が移動先（午後）に変わる
    expect(within(taskRow(RUNNING)).queryByRole("button", { name: AFTERNOON.name })).not.toBeNull();
    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
    expect(isSelected(RUNNING)).toBe(true);
  });

  it("タスク0件の日でも並び替えキーで壊れない（ルーチン未展開の日）", () => {
    renderBoard([]);

    press("J", { shiftKey: true });
    press("K", { shiftKey: true });

    expect(vi.mocked(moveTaskByStepAction)).not.toHaveBeenCalled();
    expect(rowNames()).toEqual([]);
  });

  it("Shift+K は逆方向へ動かす", () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(moveTaskByStepAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(RUNNING);

    press("K", { shiftKey: true });

    expect(vi.mocked(moveTaskByStepAction)).toHaveBeenCalledWith({
      taskId: 12,
      date: TEST_DATE,
      step: -1,
    });
    expect(rowNames()).toEqual([RUNNING, NOT_STARTED, COMPLETED]);
  });

  /**
   * 選択移動の規則そのものは domain（selection.ts）とフックが持つが、**その入力になる
   * `orderedTasks`（`optimisticGroups` の平坦化）を組むのは board** なので、
   * セクションを跨ぐ移動と現在地ジャンプはここでしか固定できない
   */
  it("J / K はセクションを跨いで選択行を移す（§5）", () => {
    renderBoard();
    selectRow(RUNNING); // 午前グループの最終行

    press("j");
    expect(isSelected(COMPLETED)).toBe(true); // 午後グループの先頭へ渡る

    press("k");
    expect(isSelected(RUNNING)).toBe(true);
  });

  it("N は現在地（実行中タスク）へ選択を戻す（§5）", () => {
    renderBoard();
    selectRow(COMPLETED);

    press("n");

    expect(isSelected(RUNNING)).toBe(true);
  });

  /**
   * 現在セクションの導出（`sections` と現在時刻が要る）は board が担うので、探索順が実際に
   * 効くかはここでしか固定できない。現在時刻 10:30 が属するのは 午前（09:00-13:00）
   */
  it("N は未分類（リスト先頭）ではなく現在セクションの未実行を選ぶ（§5 規則2 / FB-78）", () => {
    renderBoard(inboxAndSections());
    selectRow(COMPLETED);

    press("n");

    expect(isSelected(NOT_STARTED)).toBe(true);
    expect(isSelected(INBOX)).toBe(false);
  });

  it("現在セクションに未実行がなければ未分類を選ぶ（後段のセクションより先。§5 規則3）", () => {
    // 規則3 は実グルーピング（`groupTasksBySection`）を通す board 段でしか結合を確かめられない
    renderBoard([
      task({ id: 10, name: INBOX }),
      task({
        id: 11,
        name: COMPLETED,
        sectionId: FORENOON.id,
        startedAt: atJst("09:00"),
        endedAt: atJst("09:20"),
      }),
      task({ id: 13, name: NOT_STARTED, sectionId: AFTERNOON.id }), // 現在セクションより後ろ
    ]);
    selectRow(COMPLETED);

    press("n");

    expect(isSelected(INBOX)).toBe(true);
  });

  it("表示日が今日でなければ現在セクションを定義できず、表示順で最初の未実行へ戻る（§5）", () => {
    renderBoard(inboxAndSections(), { date: "2026-07-20", today: TEST_DATE, isToday: false });
    selectRow(COMPLETED);

    press("n");

    expect(isSelected(INBOX)).toBe(true);
  });

  it("全件完了の日で N を押しても選択行は消えない（§5: 選択行は常に1つ）", () => {
    renderBoard([
      task({
        id: 11,
        name: COMPLETED,
        sectionId: FORENOON.id,
        startedAt: atJst("09:00"),
        endedAt: atJst("09:20"),
      }),
    ]);
    selectRow(COMPLETED);

    press("n");

    expect(isSelected(COMPLETED)).toBe(true);
  });

  it("初期選択も現在地の規則に従う（未選択のまま未分類へは行かない。§5 / FB-78）", () => {
    // `keepSelection` の未選択フォールバックが探索順を通ることを board 段で見る
    // （実行中を置かないので規則1 では決まらない）
    renderBoard(inboxAndSections());

    expect(isSelected(NOT_STARTED)).toBe(true);
    expect(isSelected(INBOX)).toBe(false);
  });

  it("R はタスク名のインライン編集を開く", () => {
    renderBoard();
    selectRow(NOT_STARTED);

    press("r");

    expect(screen.queryByDisplayValue(NOT_STARTED)).not.toBeNull();
  });

  it("C はコメントの入力欄を開く（O-16 / F-206）", () => {
    renderBoard([task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, comment: "前に書いた" })]);
    selectRow(NOT_STARTED);

    press("c");

    expect(commentInput()).toHaveProperty("value", "前に書いた");
  });

  it("A はクイック追加欄へフォーカスする", () => {
    renderBoard();

    press("a");

    expect(document.activeElement).toBe(quickAddInput());
  });

  /**
   * 日付移動そのもの（`date` から遷移先を組む規則）はフックが持つ。board 段で固定するのは
   * **フックへ何を渡すか**——表示日 `date` と今日 `today` は別物なので、取り違えると
   * 過去日を見ているときの前後移動が「今日の前後」へ飛ぶ。既定の props は両者が同値で
   * 気づけないため、ここだけ `date !== today` で描画する
   */
  it("前日・翌日へは表示日（today ではない）を基準に移動する（§6 / O-9）", () => {
    renderBoard(defaultTasks(), { date: "2026-07-20", today: TEST_DATE, isToday: false });

    press("H", { shiftKey: true });
    press("L", { shiftKey: true });

    expect(router.push).toHaveBeenCalledWith("/?date=2026-07-19");
    expect(router.push).toHaveBeenCalledWith("/?date=2026-07-21");
    expect(router.push).toHaveBeenCalledTimes(2);
    // 表示日は URL のクエリに持つ（O-1）ので、遷移手段は push だけ
    expect(otherRouterCalls()).toEqual([]);
  });


  it("? はショートカット一覧を開閉する", () => {
    renderBoard();

    press("?", { shiftKey: true });
    expect(screen.queryByRole("heading", { name: "キーボードショートカット" })).not.toBeNull();

    press("?", { shiftKey: true });
    expect(screen.queryByRole("heading", { name: "キーボードショートカット" })).toBeNull();
  });

  it("? ボタン（画面右上）から開き、パネルの閉じるボタンで閉じられる", () => {
    renderBoard();

    clickWithoutServer(screen.getByLabelText("キーボードショートカット"));
    expect(screen.queryByRole("heading", { name: "キーボードショートカット" })).not.toBeNull();

    clickWithoutServer(screen.getByText("閉じる（Esc）"));
    expect(screen.queryByRole("heading", { name: "キーボードショートカット" })).toBeNull();
  });

  it("G は datepicker を開き、開いている間は行操作キーを背後へ流さない（§3.1 / §6）", () => {
    renderBoard();
    selectRow(NOT_STARTED);

    press("g");
    press("d"); // カレンダーの裏へ削除が届いてはいけない

    expect(screen.queryByLabelText("前月")).not.toBeNull();
    expect(vi.mocked(deleteTaskAction)).not.toHaveBeenCalled();
  });
});

