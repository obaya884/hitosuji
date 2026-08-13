// 盤面テスト（`daily-board.*.test.tsx`）のうち**楽観的更新**（N-01 / 00_共通 §4）を持つファイル。
// 即UIに反映し、失敗したらトースト＋ロールバック。
// 盤面の描画・保留・共有の操作は `../_testing/board-helpers` が持つ。
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { click, clickWithoutServer } from "@/app/_testing/interactions";
import { router } from "@/app/_testing/next-navigation";
import { atJst, TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";

import {
  duplicateTaskAction,
  finishTaskAction,
  renameTaskAction,
  setTaskHighlightAction,
  startTaskAction,
  suspendTaskAction,
  undoStartAction,
  updateTaskCommentAction,
  updateTaskEstimateAction,
  type CreatingActionResult,
  type DailyActionResult,
} from "../actions";
import {
  COMPLETED,
  CREATED,
  commentInput,
  commit,
  defaultTasks,
  FORENOON,
  hold,
  INBOX,
  NOT_STARTED,
  NOW,
  OK,
  press,
  pressAndSettle,
  renderBoard,
  RUNNING,
  selectRow,
  setupBoard,
} from "../_testing/board-helpers";
import { isSelected, rowAt, rowNames, taskRow } from "../_testing/table-helpers";

vi.mock("../actions", async () => (await import("../_testing/action-mocks")).actionMocks());

setupBoard();

/** ハイライトの⭐（O-17）。ON/OFF は `aria-pressed` が持つ */
function starOf(name: string): HTMLElement {
  return within(taskRow(name)).getByRole("button", { name: "ハイライト" });
}

describe("DailyBoard の楽観的更新（N-01 / 00_共通 §4: 即UIに反映 → 失敗時はトースト＋ロールバック）", () => {
  it("開始打刻はサーバ確定を待たずに実行中として反映する", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));

    // 未解決のまま＝サーバ確定前に実行中（終了できる状態）になっている
    expect(within(taskRow(NOT_STARTED)).queryByLabelText("終了")).not.toBeNull();
  });

  // FB-69: 確定を待つあいだ実行中に見える行が2件並んでいた。相手の終了まで先取りして解消する（O-2）
  it("割り込みの開始打刻は相手の実行中タスクも確定を待たずに完了へ変える（O-2 / FB-69）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));

    // 実行中に見える行は開始した1件だけ＝相手はもう終了できない
    expect(within(taskRow(RUNNING)).queryByLabelText("終了")).toBeNull();
    expect(within(taskRow(RUNNING)).queryByLabelText("完了済み")).not.toBeNull();

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    // 拒否されたら相手も実行中へ戻る（先取りした分まで巻き戻す）
    expect(within(taskRow(RUNNING)).queryByLabelText("終了")).not.toBeNull();
  });

  it("開始打刻の失敗はエラートーストを出して未実行へ巻き戻す", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));
    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
    expect(within(taskRow(NOT_STARTED)).queryByLabelText("開始")).not.toBeNull();
  });

  it("タスク名の変更は確定前に反映し、失敗すると元の名前へ戻す", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(renameTaskAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("r");
    commit(screen.getByDisplayValue(NOT_STARTED), "資料の下書き");
    expect(screen.queryByText("資料の下書き")).not.toBeNull();

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(screen.queryByText("資料の下書き")).toBeNull();
    expect(screen.queryByText(NOT_STARTED)).not.toBeNull();
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
  });

  it("通信できずに終わった打刻も素通りさせず、トーストを出して巻き戻す（00_共通 §4.1 / FB-64）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {}); // callAction が出す原因ログを抑える
    vi.mocked(startTaskAction).mockRejectedValue(new Error("Failed to fetch"));
    renderBoard();

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));

    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
    expect(within(taskRow(NOT_STARTED)).queryByLabelText("開始")).not.toBeNull();
    // 届かなかった以上、取り直しに行っても また失敗するだけなので行かない（§4.1）
    expect(router.refresh).not.toHaveBeenCalled();
  });

  // `router` は偽物なので観測できるのは**取り直しを要求したところまで**。
  // 取り直した結果として消えた行が画面から消えるかは実機での確認に委ねる
  it("サーバが失敗を返したら表示中のデータを取り直す（00_共通 §4.1 / FB-70）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));
    await gate.resolve({ ok: false, message: "タスクが見つかりませんでした" });

    // 消えた行が画面に残り、触るたび同じ失敗を繰り返す状態にしない（§4.1）
    expect(screen.queryByText("タスクが見つかりませんでした")).not.toBeNull();
    expect(router.refresh).toHaveBeenCalledOnce();
  });

  it("成功したときは取り直さない（サーバ側の revalidate で反映される）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));
    await gate.resolve(OK);

    expect(vi.mocked(startTaskAction)).toHaveBeenCalledOnce(); // 操作自体は走っている
    expect(screen.queryByText("保存に失敗しました")).toBeNull();
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it("エラートーストは × で閉じられる（00_共通 §2.2）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));
    await gate.resolve({ ok: false, message: "保存に失敗しました" });
    clickWithoutServer(screen.getByLabelText("閉じる"));

    expect(screen.queryByText("保存に失敗しました")).toBeNull();
  });

  it("見積もりの変更は確定前に反映し、失敗すると元の値へ戻す", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(updateTaskEstimateAction).mockReturnValue(gate.promise);
    // 巻き戻り先の 0:30 をテスト本文で決める（既定値に寄りかからない）
    renderBoard([task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, estimateMinutes: 30 })]);
    selectRow(NOT_STARTED);

    press("e");
    commit(screen.getByPlaceholderText("分"), "45");
    expect(within(taskRow(NOT_STARTED)).queryByText("0:45")).not.toBeNull();

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(within(taskRow(NOT_STARTED)).queryByText("0:30")).not.toBeNull();
  });

  it("コメントの追加は確定前に反映し、失敗すると元へ戻す（F-206 / O-16）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(updateTaskCommentAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("c");
    commit(commentInput(), "元データ探しに手間取った");
    // 選択行なので全文が下に出る（§3.3）
    expect(screen.queryByText("元データ探しに手間取った")).not.toBeNull();

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(screen.queryByText("元データ探しに手間取った")).toBeNull();
    expect(within(taskRow(NOT_STARTED)).queryByLabelText("コメントを編集")).toBeNull();
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
  });

  it("ハイライトは確定前に反映し、失敗すると元へ戻す（F-118 / O-17 / N-01）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(setTaskHighlightAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("h");
    expect(starOf(NOT_STARTED).getAttribute("aria-pressed")).toBe("true");

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(starOf(NOT_STARTED).getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
  });

  it("ハイライト済みの行では OFF を送る（トグルの反転。O-17）", () => {
    renderBoard([task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, highlighted: true })]);
    selectRow(NOT_STARTED);

    press("h");

    expect(vi.mocked(setTaskHighlightAction)).toHaveBeenCalledWith(11, false);
    expect(starOf(NOT_STARTED).getAttribute("aria-pressed")).toBe("false");
  });

  it("⭐のクリックでも同じくトグルする（O-17）", async () => {
    renderBoard([task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, highlighted: false })]);
    // 未ハイライト行の⭐は選択行にだけ出る（§3.3）ので、既定選択に頼らず自分で選ぶ
    selectRow(NOT_STARTED);

    await click(starOf(NOT_STARTED));

    expect(vi.mocked(setTaskHighlightAction)).toHaveBeenCalledWith(11, true);
  });

  // O-17: 状態も日付も問わない。終了予定（F-104）等の「今日だけ」の規律は、
  // 現在時刻から導出する値の話であって、保存された宣言であるハイライトには及ばない（要件 §5.1）
  it("今日以外を表示中でもハイライトを付け外しできる（表示日を問わない）", () => {
    renderBoard([task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, taskDate: "2026-07-20" })], {
      date: "2026-07-20",
      today: TEST_DATE,
      isToday: false,
    });
    selectRow(NOT_STARTED);

    press("h");

    expect(vi.mocked(setTaskHighlightAction)).toHaveBeenCalledWith(11, true);
  });

  // O-17: ハイライトは `U`（取り消し）の対象にしない——同じ操作でそのまま戻せるため、
  // 削除・完了の取り消しと保留1スロットを奪い合わせない（O-13）
  it("ハイライトされた実行中タスクの `U` は開始打刻の取り消しで、ハイライトには触れない", async () => {
    renderBoard([
      task({
        id: 11,
        name: RUNNING,
        sectionId: FORENOON.id,
        startedAt: atJst("09:00"),
        highlighted: true,
      }),
    ]);
    selectRow(RUNNING);

    await pressAndSettle("u");

    // 実行中タスクを選択中の `U` は開始打刻の取り消し（O-13）
    expect(vi.mocked(undoStartAction)).toHaveBeenCalledOnce();
    expect(vi.mocked(setTaskHighlightAction)).not.toHaveBeenCalled();
    expect(starOf(RUNNING).getAttribute("aria-pressed")).toBe("true");
  });

  it("空で確定するとコメントを消す（印も全文も消える。O-16）", async () => {
    renderBoard([
      task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, comment: "書いてあった" }),
    ]);
    selectRow(NOT_STARTED);

    press("c");
    commit(commentInput(), "   ");

    expect(vi.mocked(updateTaskCommentAction)).toHaveBeenCalledWith(11, "   ");
    expect(screen.queryByText("書いてあった")).toBeNull();
    expect(within(taskRow(NOT_STARTED)).queryByLabelText("コメントを編集")).toBeNull();
  });

  it("終了打刻をサーバが拒んだら、行の巻き戻しに合わせて選択も打刻した行へ戻す（F-211 / §5）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(finishTaskAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(RUNNING);

    await click(within(taskRow(RUNNING)).getByLabelText("終了"));
    // 確定前は送り先（現在地）が選ばれている
    expect(isSelected(NOT_STARTED)).toBe(true);

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    // 行の巻き戻し（実行中へ戻る）・トースト・選択の3つが揃って初めて条項どおり
    expect(within(taskRow(RUNNING)).queryByLabelText("終了")).not.toBeNull();
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
    expect(isSelected(RUNNING)).toBe(true);
    expect(isSelected(NOT_STARTED)).toBe(false);
  });

  // 選択の戻しは `run` の onFailure（callAction の外側）にある。内側に置くと通信断のときだけ
  // 走らず、行だけ巻き戻って選択が送り先に残る（00_共通 §4.1 / FB-64）
  it("通信できずに終わった終了打刻でも選択を打刻した行へ戻す（F-211 / §5 / 00_共通 §4.1）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(finishTaskAction).mockRejectedValue(new Error("Failed to fetch"));
    renderBoard();
    selectRow(RUNNING);

    await click(within(taskRow(RUNNING)).getByLabelText("終了"));

    expect(within(taskRow(RUNNING)).queryByLabelText("終了")).not.toBeNull();
    expect(isSelected(RUNNING)).toBe(true);
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
  });

  it("終了打刻の拒否は、打刻前に選んでいた別の行ではなく打刻した行へ戻す（F-211 / §5）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(finishTaskAction).mockReturnValue(gate.promise);
    renderBoard();
    // 送り先（NOT_STARTED）でも打刻対象（RUNNING）でもない第3の行を選んでおく
    selectRow(COMPLETED);

    await click(within(taskRow(RUNNING)).getByLabelText("終了"));
    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(isSelected(RUNNING)).toBe(true);
    expect(isSelected(COMPLETED)).toBe(false);
  });

  it("`Enter` の終了打刻も拒否されたら選択を打刻した行へ戻す（F-211 / §5 / §6）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(finishTaskAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(RUNNING);

    await pressAndSettle("Enter");
    expect(isSelected(NOT_STARTED)).toBe(true);

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(isSelected(RUNNING)).toBe(true);
  });

  it("終了打刻の拒否でも、確定を待つ間に選び直した行は上書きしない（F-211 / §5）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(finishTaskAction).mockReturnValue(gate.promise);
    renderBoard([task({ id: 10, name: INBOX }), ...defaultTasks()]);
    selectRow(RUNNING);

    await click(within(taskRow(RUNNING)).getByLabelText("終了"));
    selectRow(INBOX); // 送られた選択を待っている間にユーザーが動かす
    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(isSelected(INBOX)).toBe(true);
  });

  it("中断（O-4）は楽観的更新の対象外でサーバ確定まで実行中のまま", () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(suspendTaskAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(RUNNING);

    press("i");

    expect(vi.mocked(suspendTaskAction)).toHaveBeenCalledWith(12, NOW);
    expect(within(taskRow(RUNNING)).queryByLabelText("終了")).not.toBeNull();
  });

  it("複製（O-11）は採番をサーバが決めるため楽観的更新しない", () => {
    const gate = hold<CreatingActionResult>(CREATED);
    vi.mocked(duplicateTaskAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("y");

    expect(vi.mocked(duplicateTaskAction)).toHaveBeenCalledWith(11);
    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
  });

  it("複製（O-11）の確定後は選択を複製されたタスクへ移す", async () => {
    vi.mocked(duplicateTaskAction).mockResolvedValue({ ok: true, createdId: 31 });
    const { applyServerState } = renderBoard();
    selectRow(NOT_STARTED);

    await pressAndSettle("y");
    // サーバが採番した複製（同名）が現れる。複製元 id:11 は現在位置より前なので、
    // 直下に入った複製行は同じ描画で規則b により実行中 id:12 の直後へ繰り下がる（O-11）
    applyServerState([
      ...defaultTasks(),
      task({ id: 31, name: NOT_STARTED, sectionId: FORENOON.id, sortOrder: 3000 }),
    ]);

    // 同名の行が2つ並ぶので位置で見る（複製元ではなく複製へ移っている）
    expect(isSelected(rowAt(2))).toBe(true);
    expect(isSelected(rowAt(0))).toBe(false);
  });
});
