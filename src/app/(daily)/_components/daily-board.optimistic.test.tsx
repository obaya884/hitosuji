// 盤面テスト（`daily-board.*.test.tsx`）のうち**楽観的更新**（N-01 / 00_共通 §4）を持つファイル。
// 即UIに反映し、失敗したらトースト＋ロールバック。
// 盤面の描画・保留・共有の操作は `../_testing/board-helpers` が持つ。
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { CALL_FAILED_LOG } from "@/app/_lib/action-result";
import { expectConsoleError } from "@/app/_testing/console-guard";
import { click, clickWithoutServer } from "@/app/_testing/interactions";
import { router } from "@/app/_testing/next-navigation";
import { atJst, TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";

import {
  addTaskAction,
  createRoutineFromTaskAction,
  deleteTaskAction,
  duplicateTaskAction,
  finishTaskAction,
  moveTaskByStepAction,
  renameTaskAction,
  setTaskHighlightAction,
  startTaskAction,
  suspendTaskAction,
  undoStartAction,
  updateTaskCommentAction,
  updateTaskEstimateAction,
  updateTaskUrlAction,
  type CreatingActionResult,
  type DailyActionResult,
} from "../actions";
import {
  AFTERNOON,
  COMPLETED,
  CREATED,
  commentInput,
  commit,
  defaultTasks,
  FORENOON,
  hold,
  INBOX,
  LATER_NOT_STARTED,
  NOT_STARTED,
  NOW,
  OK,
  press,
  pressAndSettle,
  quickAddInput,
  renderBoard,
  RUNNING,
  selectRow,
  settledTasks,
  setupBoard,
} from "../_testing/board-helpers";
import { isSelected, rowAt, rowNames, taskRow } from "../_testing/table-helpers";

vi.mock("../actions", async () => (await import("../_testing/action-mocks")).actionMocks());

setupBoard();

/** 中断・割り込みで生まれる、実行中タスクの再開タスク（O-4 / O-2）の名前 */
const RESUMED = `${RUNNING}（再開）`;

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

    // 拒否されたら相手も実行中へ戻る（先取りした分まで巻き戻す）。再開タスクの仮の行と規則a の移動も戻る
    expect(within(taskRow(RUNNING)).queryByLabelText("終了")).not.toBeNull();
    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
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
    vi.mocked(startTaskAction).mockRejectedValue(new Error("Failed to fetch"));
    renderBoard();

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));

    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
    expect(within(taskRow(NOT_STARTED)).queryByLabelText("開始")).not.toBeNull();
    // 届かなかった以上、取り直しに行っても また失敗するだけなので行かない（00_共通 §4.1）
    expect(router.refresh).not.toHaveBeenCalled();
    expectConsoleError(CALL_FAILED_LOG); // 画面には出さない原因は握り潰さずログへ出す
  });

  // `router` は偽物なので観測できるのは**取り直しを要求したところまで**。
  // 取り直した結果として消えた行が画面から消えるかは実機での確認に委ねる
  it("サーバが失敗を返したら表示中のデータを取り直す（00_共通 §4.1 / FB-70）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));
    await gate.resolve({ ok: false, message: "タスクが見つかりませんでした" });

    // 消えた行が画面に残り、触るたび同じ失敗を繰り返す状態にしない（00_共通 §4.1）
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
  // 現在時刻から導出する値の話であって、保存された宣言であるハイライトには及ばない（要件定義書 §5.1）
  it("今日以外を表示中でもハイライトを付け外しできる（表示日を問わない）", () => {
    renderBoard([task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, taskDate: "2026-07-20" })], {
      date: "2026-07-20",
      today: TEST_DATE,
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
    vi.mocked(finishTaskAction).mockRejectedValue(new Error("Failed to fetch"));
    renderBoard();
    selectRow(RUNNING);

    await click(within(taskRow(RUNNING)).getByLabelText("終了"));

    expect(within(taskRow(RUNNING)).queryByLabelText("終了")).not.toBeNull();
    expect(isSelected(RUNNING)).toBe(true);
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
    expectConsoleError(CALL_FAILED_LOG);
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

  it("中断（O-4）は終了と、再開タスクの仮の行（直後）を確定前に出す", () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(suspendTaskAction).mockReturnValue(gate.promise);
    renderBoard(settledTasks());
    selectRow(RUNNING);

    press("i");

    expect(vi.mocked(suspendTaskAction)).toHaveBeenCalledWith(12, NOW);
    expect(within(taskRow(RUNNING)).queryByLabelText("終了")).toBeNull();
    expect(rowNames()).toEqual([RUNNING, `${RUNNING}（再開）`, NOT_STARTED, COMPLETED]);
  });

  it("中断が拒まれたら再開タスクの仮の行を消し、実行中へ戻す（00_共通 §4.1）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(suspendTaskAction).mockReturnValue(gate.promise);
    renderBoard(settledTasks());
    selectRow(RUNNING);

    press("i");
    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(rowNames()).toEqual([RUNNING, NOT_STARTED, COMPLETED]);
    expect(within(taskRow(RUNNING)).queryByLabelText("終了")).not.toBeNull();
  });

  it("複製（O-11）は複製の仮の行を直下に確定前から出す", () => {
    const gate = hold<CreatingActionResult>(CREATED);
    vi.mocked(duplicateTaskAction).mockReturnValue(gate.promise);
    renderBoard(settledTasks());
    selectRow(NOT_STARTED);

    press("y");

    expect(vi.mocked(duplicateTaskAction)).toHaveBeenCalledWith(11);
    expect(rowNames()).toEqual([RUNNING, NOT_STARTED, NOT_STARTED, COMPLETED]);
    // 仮の行へ選択を移すのは確定後（画面定義書01 §4 冒頭「仮の行」）。まだ複製元に居る
    expect(isSelected(rowAt(1))).toBe(true);
  });

  it("複製（O-11）の確定待ちのあいだはキー操作をすべて受け付けない（§4 冒頭「仮の行」）", () => {
    const gate = hold<CreatingActionResult>(CREATED);
    vi.mocked(duplicateTaskAction).mockReturnValue(gate.promise);
    renderBoard(settledTasks());
    selectRow(NOT_STARTED);

    press("y");
    press("k"); // 選択の移動も止まる
    press("Enter"); // 複製元の開始にならない

    expect(isSelected(rowAt(1))).toBe(true);
    expect(vi.mocked(startTaskAction)).not.toHaveBeenCalled();
  });

  it("複製が拒まれたら仮の行を消す（00_共通 §4.1）", async () => {
    const gate = hold<CreatingActionResult>(CREATED);
    vi.mocked(duplicateTaskAction).mockReturnValue(gate.promise);
    renderBoard(settledTasks());
    selectRow(NOT_STARTED);

    press("y");
    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(rowNames()).toEqual([RUNNING, NOT_STARTED, COMPLETED]);
    // 確定が終わったのでキー操作も戻る
    press("k");
    expect(isSelected(RUNNING)).toBe(true);
  });

  it("開始した行は確定前に規則a の位置へ移り、再開タスクの仮の行がその直下に出る（O-2 / FB-96）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard([
      ...settledTasks(),
      task({ id: 14, name: LATER_NOT_STARTED, sectionId: AFTERNOON.id, sortOrder: 2000 }),
    ]);

    await click(within(taskRow(LATER_NOT_STARTED)).getByLabelText("開始"));

    // 10:30 開始なので午前へ。10:00 開始の実行中（いまは割り込まれて完了）より後ろ、未実行より前
    expect(rowNames()).toEqual([
      RUNNING,
      LATER_NOT_STARTED,
      `${RUNNING}（再開）`,
      NOT_STARTED,
      COMPLETED,
    ]);
  });

  it("前日以前の実行中タスクを割り込んだときも、再開タスクの仮の行が表示日に出る（O-2）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    const stale = task({ id: 99, taskDate: "2026-07-01", name: "前日の作業", startedAt: atJst("22:00") });
    renderBoard(
      settledTasks().filter((t) => t.name !== RUNNING),
      { staleRunningTask: stale }
    );

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));

    expect(rowNames()).toEqual([NOT_STARTED, "前日の作業（再開）", COMPLETED]);
  });

  // 仮 id の連番は生成元（追加・開始・中断・複製）をまたいで共有する（T-63）。重なると片方が他方を巻き添えにする
  it("割り込みの再開タスクとクイック追加の仮の行は、別々の行として並ぶ（T-63）", async () => {
    const startGate = hold<DailyActionResult>(OK);
    vi.mocked(startTaskAction).mockReturnValue(startGate.promise);
    const addGate = hold<CreatingActionResult>(CREATED);
    vi.mocked(addTaskAction).mockReturnValue(addGate.promise);
    renderBoard(settledTasks());

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));
    fireEvent.change(quickAddInput(), { target: { value: "洗濯" } });
    fireEvent.keyDown(quickAddInput(), { key: "Enter" });

    expect(rowNames()).toEqual(["洗濯", RUNNING, NOT_STARTED, `${RUNNING}（再開）`, COMPLETED]);
    selectRow("洗濯");
    expect(isSelected("洗濯")).toBe(true);
    expect(isSelected(`${RUNNING}（再開）`)).toBe(false);
  });

  // キーの経路は上の Enter / d で見る。ここはクリック・Shift+J の入口（ハンドラの先頭の判定）
  it.each([
    ["Shift+J", () => press("J", { shiftKey: true }), moveTaskByStepAction],
    ["名前のクリック", () => clickWithoutServer(screen.getByRole("button", { name: RESUMED })), renameTaskAction],
    ["⭐のクリック", () => clickWithoutServer(starOf(RESUMED)), setTaskHighlightAction],
  ] as const)("仮の行への %s は何もしない（§4 冒頭「仮の行」）", async (_, operate, action) => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(suspendTaskAction).mockReturnValue(gate.promise);
    renderBoard(settledTasks());
    selectRow(RUNNING);
    press("i");
    selectRow(RESUMED);

    operate();

    expect(vi.mocked(action)).not.toHaveBeenCalled();
    expect(screen.queryByDisplayValue(RESUMED)).toBeNull(); // 名前の編集欄も開かない
    expect(rowNames()).toEqual([RUNNING, RESUMED, NOT_STARTED, COMPLETED]);
  });

  // ルーチン化のポップオーバーは編集の開始（`onBeginEdit`）を通って開くので、仮の行ではそこで止まる
  it("仮の行の行メニューからルーチン化を選んでもポップオーバーを開かない（§4 冒頭「仮の行」）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(suspendTaskAction).mockReturnValue(gate.promise);
    renderBoard(settledTasks());
    selectRow(RUNNING);
    press("i");

    clickWithoutServer(within(taskRow(RESUMED)).getByLabelText("行メニュー"));
    await click(screen.getByRole("button", { name: "ルーチン化" }));

    expect(screen.queryByRole("button", { name: "作成" })).toBeNull();
    expect(vi.mocked(createRoutineFromTaskAction)).not.toHaveBeenCalled();
  });

  it("仮の行は選択できるが、操作は効かない（§4 冒頭「仮の行」）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard(settledTasks());

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));
    selectRow(`${RUNNING}（再開）`);
    press("Enter");
    press("d");

    expect(isSelected(`${RUNNING}（再開）`)).toBe(true);
    expect(vi.mocked(startTaskAction)).toHaveBeenCalledTimes(1); // 最初の開始だけ
    expect(vi.mocked(deleteTaskAction)).not.toHaveBeenCalled();
  });

  it("複製（O-11）の確定後は選択を複製されたタスクへ移す", async () => {
    vi.mocked(duplicateTaskAction).mockResolvedValue({ ok: true, createdId: 31 });
    const { applyServerState } = renderBoard(settledTasks());
    selectRow(NOT_STARTED);

    await pressAndSettle("y");
    // サーバが採番した複製（同名）が複製元の直下に現れる
    applyServerState([
      ...settledTasks(),
      task({ id: 31, name: NOT_STARTED, sectionId: FORENOON.id, sortOrder: 3500 }),
    ]);

    // 同名の行が2つ並ぶので位置で見る（複製元ではなく複製へ移っている）
    expect(isSelected(rowAt(2))).toBe(true);
    expect(isSelected(rowAt(0))).toBe(false);
  });
});

describe("URL の楽観的更新（O-18 / F-125 / N-01）", () => {
  const URL_A = "https://example.com/a";

  /** 行メニューの「URL」で入力欄を開く（ショートカットは割り当てない。§6） */
  function openUrlEditor(name: string) {
    fireEvent.click(within(taskRow(name)).getByLabelText("行メニュー"));
    fireEvent.click(screen.getByRole("button", { name: "URL" }));
    return screen.getByPlaceholderText("https://");
  }

  it("URL の追加は確定前に印を出し、失敗すると印が消えてエラートーストを出す", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(updateTaskUrlAction).mockReturnValue(gate.promise);
    renderBoard();

    commit(openUrlEditor(NOT_STARTED), URL_A);
    expect(within(taskRow(NOT_STARTED)).queryByRole("button", { name: "URL を開く" })).not.toBeNull();

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(within(taskRow(NOT_STARTED)).queryByRole("button", { name: "URL を開く" })).toBeNull();
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
  });

  it("URL の消去は確定前に印を消し、失敗すると印が戻る", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(updateTaskUrlAction).mockReturnValue(gate.promise);
    renderBoard([task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, url: URL_A })]);

    commit(openUrlEditor(NOT_STARTED), "");
    expect(within(taskRow(NOT_STARTED)).queryByRole("button", { name: "URL を開く" })).toBeNull();

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(within(taskRow(NOT_STARTED)).queryByRole("button", { name: "URL を開く" })).not.toBeNull();
  });
});
