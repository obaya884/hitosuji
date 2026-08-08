// 盤面テスト（`daily-board.*.test.tsx`）のうち**打刻とその取り消し**を持つファイル
// （F-201 / F-211 / F-212 / O-13 / O-15 / §7）。開始・終了・完了の取り消しと `U` の切り分け。
// **失敗したときの巻き戻しは `optimistic`**、打刻時刻の修正（F-203）は `editing` にある。
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { formatClock, formatDuration } from "@/app/_lib/format";
import { click } from "@/app/_testing/interactions";
import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";

import {
  duplicateAndStartTaskAction,
  finishTaskAction,
  restoreCompletionAction,
  restoreTaskAction,
  startTaskAction,
  suspendTaskAction,
  undoCompleteAction,
  undoStartAction,
  type DailyActionResult,
} from "../actions";
import {
  AFTERNOON,
  COMPLETED,
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
  UNCOMPLETE_OK,
  type UndoCompleteResult,
} from "../_testing/board-helpers";
import { cellsOf, isSelected, rowAt, taskRow } from "../_testing/table-helpers";

vi.mock("../actions", async () => (await import("../_testing/action-mocks")).actionMocks());

setupBoard();

describe("DailyBoard の打刻（F-201 / F-211 / §7: クライアントの現在時刻を送る）", () => {
  it("開始打刻はクライアントの現在時刻を Server Action へ送る（サーバ時刻を使わない）", async () => {
    renderBoard();

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));

    expect(vi.mocked(startTaskAction)).toHaveBeenCalledWith(11, NOW);
  });

  it("開始打刻の楽観的更新はクライアントの現在時刻をその場に表示する", async () => {
    // 主張は「確定前に出ている」こと。解決させると楽観的更新が解けて props の状態へ戻るので保留する
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));

    expect(within(cellsOf(taskRow(NOT_STARTED)).time).queryByText(formatClock(NOW))).not.toBeNull();
  });

  it("終了打刻もクライアントの現在時刻を送り、実績を即時に表示する", async () => {
    // 実績の表示も確定前の主張なので、保留したまま観測する
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(finishTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    await click(within(taskRow(RUNNING)).getByLabelText("終了"));

    expect(vi.mocked(finishTaskAction)).toHaveBeenCalledWith(12, NOW);
    // 10:00 開始 → 10:30 終了 = 実績 0:30
    expect(
      within(cellsOf(taskRow(RUNNING)).actual).queryByText(`→ ${formatDuration(30)}`)
    ).not.toBeNull();
  });

  it("終了打刻で完了したら選択行を現在地へ送る（F-211 / §5）", async () => {
    // 選択の移動は確定を待たない（§5）ので、保留したまま送り先を読む
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(finishTaskAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(RUNNING);

    await click(within(taskRow(RUNNING)).getByLabelText("終了"));

    expect(isSelected(NOT_STARTED)).toBe(true);
    expect(isSelected(RUNNING)).toBe(false);
  });

  it("終了打刻の送り先も未分類ではなく現在セクションの未実行（F-211 / §5 規則2 / FB-78）", async () => {
    // 現在時刻 10:30 が属するのは 午前（09:00-13:00）。未分類はリスト先頭に居るが送り先にしない
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(finishTaskAction).mockReturnValue(gate.promise);
    renderBoard([task({ id: 10, name: INBOX }), ...defaultTasks()]);
    selectRow(RUNNING);

    await click(within(taskRow(RUNNING)).getByLabelText("終了"));

    expect(isSelected(NOT_STARTED)).toBe(true);
    expect(isSelected(INBOX)).toBe(false);
  });

  it("現在セクションに未実行がなければ送り先は未分類（F-211 / §5 規則3）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(finishTaskAction).mockReturnValue(gate.promise);
    renderBoard([
      task({ id: 10, name: INBOX }),
      task({ id: 12, name: RUNNING, sectionId: FORENOON.id, startedAt: atJst("10:00") }),
      task({ id: 13, name: NOT_STARTED, sectionId: AFTERNOON.id }), // 現在セクションより後ろ
    ]);
    selectRow(RUNNING);

    await click(within(taskRow(RUNNING)).getByLabelText("終了"));

    expect(isSelected(INBOX)).toBe(true);
  });

  it("送り先の未実行タスクがなければ打刻した行を選ぶ（F-211）", async () => {
    // 保留したまま読む。確定させると完了が解けて実行中に戻り、「打刻した行を選んだ」のか
    // 「選択を捨てて現在地（＝実行中の行）から採り直した」のかが区別できなくなる
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(finishTaskAction).mockReturnValue(gate.promise);
    renderBoard([task({ id: 12, name: RUNNING, sectionId: FORENOON.id, startedAt: atJst("10:00") })]);
    selectRow(RUNNING);

    await click(within(taskRow(RUNNING)).getByLabelText("終了"));

    expect(isSelected(RUNNING)).toBe(true);
  });

  it("送り先がなければ、別の行を選んだまま打刻しても選択は打刻した行へ移る（F-211 / §5）", async () => {
    // 打刻対象でも送り先でもない第3の行を選んでおく（拒否されたときの戻し先と同じ規則）
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(finishTaskAction).mockReturnValue(gate.promise);
    renderBoard([
      task({ id: 12, name: RUNNING, sectionId: FORENOON.id, startedAt: atJst("10:00") }),
      task({
        id: 14,
        name: COMPLETED,
        sectionId: FORENOON.id,
        startedAt: atJst("09:00"),
        endedAt: atJst("09:30"),
      }),
    ]);
    selectRow(COMPLETED);

    await click(within(taskRow(RUNNING)).getByLabelText("終了"));

    expect(isSelected(RUNNING)).toBe(true);
    expect(isSelected(COMPLETED)).toBe(false);
  });

  it("終了打刻がサーバで確定したら選択は送り先に残る（F-211）", async () => {
    const { applyServerState } = renderBoard();
    selectRow(RUNNING);

    await click(within(taskRow(RUNNING)).getByLabelText("終了"));
    // サーバ確定後の再取得（完了した打刻が乗った状態）まで流して確かめる
    applyServerState([
      task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, sortOrder: 1000 }),
      task({
        id: 12,
        name: RUNNING,
        sectionId: FORENOON.id,
        sortOrder: 2000,
        startedAt: atJst("10:00"),
        endedAt: NOW,
      }),
    ]);

    expect(isSelected(NOT_STARTED)).toBe(true);
    expect(isSelected(RUNNING)).toBe(false);
  });

  it("完了タスクの Enter は複製して開始（O-14 / F-208）で、打刻アクションは呼ばない", () => {
    renderBoard();
    selectRow(COMPLETED);

    press("Enter");

    expect(vi.mocked(duplicateAndStartTaskAction)).toHaveBeenCalledWith(13, NOW);
    expect(vi.mocked(startTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(finishTaskAction)).not.toHaveBeenCalled();
  });

  it("複製して開始（O-14）の確定後は選択を複製タスクへ移す", async () => {
    vi.mocked(duplicateAndStartTaskAction).mockResolvedValue({ ok: true, createdId: 32 });
    const { applyServerState } = renderBoard();
    selectRow(COMPLETED);

    await pressAndSettle("Enter");
    // サーバが採番した複製（同名・実行中）が末尾に現れる
    applyServerState([
      ...defaultTasks(),
      task({ id: 32, name: COMPLETED, sectionId: AFTERNOON.id, sortOrder: 2000, startedAt: NOW }),
    ]);

    // 同名の行が2つ並ぶので位置で見る（複製元は完了のまま残る）
    expect(isSelected(rowAt(3))).toBe(true);
    expect(isSelected(rowAt(2))).toBe(false);
  });

  it("完了タスクの打刻ボタンは操作なし（O-14: Enter 限定）", () => {
    renderBoard();

    expect(within(taskRow(COMPLETED)).getByLabelText("完了済み")).toHaveProperty("disabled", true);
  });

  it("割り込み（O-2 / F-201）を画面側で2アクションに分解せず、開始の1操作だけをサーバへ送る", async () => {
    renderBoard();

    await click(within(taskRow(NOT_STARTED)).getByLabelText("開始"));

    // 相手の終了は表示だけ先取りし（optimistic.ts）、永続化は startTaskAction の1トランザクション
    expect(vi.mocked(startTaskAction)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(finishTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(suspendTaskAction)).not.toHaveBeenCalled();
  });
});

describe("DailyBoard の完了の取り消し（O-15 / F-212）", () => {
  it("完了タスクの U は打刻2列を即クリアし、確定後に Undo トーストを出す", async () => {
    const snapshot = {
      taskId: 13,
      startedAt: atJst("09:00"),
      endedAt: atJst("09:20"),
      sectionId: AFTERNOON.id,
      sortOrder: 1000,
    };
    const gate = hold<UndoCompleteResult>(UNCOMPLETE_OK);
    vi.mocked(undoCompleteAction).mockReturnValue(gate.promise);
    const { applyServerState } = renderBoard();
    selectRow(COMPLETED);

    press("u");
    // 楽観的更新は打刻2列のクリアだけ（並べ直しはサーバ確定後。O-15）
    expect(vi.mocked(undoCompleteAction)).toHaveBeenCalledWith(13, NOW);
    expect(within(taskRow(COMPLETED)).queryByText(formatClock(atJst("09:00")))).toBeNull();
    expect(within(taskRow(COMPLETED)).queryByText("→ 0:20")).toBeNull();

    await gate.resolve({ ok: true, snapshot });
    applyServerState([
      ...defaultTasks().filter((t) => t.id !== 13),
      task({ id: 13, name: COMPLETED, sectionId: FORENOON.id, sortOrder: 1500 }),
    ]);

    expect(within(taskRow(COMPLETED)).queryByText(formatClock(atJst("09:00")))).toBeNull();
    expect(screen.queryByText(`「${COMPLETED}」を未実行に戻しました`)).not.toBeNull();
  });

  it("Undo トーストの「取り消す」はスナップショットで完了状態へ復帰させる", async () => {
    renderBoard();
    selectRow(COMPLETED);
    await pressAndSettle("u");

    await click(screen.getByText("取り消す"));

    expect(vi.mocked(restoreCompletionAction)).toHaveBeenCalledWith({
      taskId: 13,
      startedAt: atJst("09:00"),
      endedAt: atJst("09:20"),
      sectionId: AFTERNOON.id,
      sortOrder: 1000,
    });
  });

  it("完了の取り消しが失敗したら打刻を戻してエラートーストを出す", async () => {
    const gate = hold<UndoCompleteResult>(UNCOMPLETE_OK);
    vi.mocked(undoCompleteAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(COMPLETED);

    press("u");
    expect(within(taskRow(COMPLETED)).queryByText(formatClock(atJst("09:00")))).toBeNull();
    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(within(taskRow(COMPLETED)).queryByText(formatClock(atJst("09:00")))).not.toBeNull();
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
    expect(screen.queryByText("取り消す")).toBeNull();
  });
});

describe("DailyBoard の U の切り分け（O-13: 保留 → 実行中 → 完了 → 何もしない）", () => {
  it("取り消しの保留があるあいだの U は保留の解決を最優先する（開始取消に化けない）", async () => {
    renderBoard();
    selectRow(NOT_STARTED);
    await pressAndSettle("d"); // 削除で選択は現在地（実行中タスク）へ移る

    await pressAndSettle("u");

    expect(vi.mocked(restoreTaskAction)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(undoStartAction)).not.toHaveBeenCalled();
  });

  it("保留がなく実行中タスクを選択中の U は開始打刻を取り消す（F-210）", () => {
    renderBoard();
    selectRow(RUNNING);

    press("u");

    expect(vi.mocked(undoStartAction)).toHaveBeenCalledWith(12, NOW);
    // 楽観的更新は打刻のクリアだけ（並べ直しはサーバ確定後）
    expect(within(taskRow(RUNNING)).queryByLabelText("開始")).not.toBeNull();
  });

  it("保留がなく未実行タスクを選択中の U は何もしない", () => {
    renderBoard();
    selectRow(NOT_STARTED);

    press("u");

    expect(vi.mocked(undoStartAction)).not.toHaveBeenCalled();
    expect(vi.mocked(undoCompleteAction)).not.toHaveBeenCalled();
    expect(vi.mocked(restoreTaskAction)).not.toHaveBeenCalled();
  });

  it("完了の取り消しが通信できずに終わったら打刻を戻し、Undo も出さない（00_共通 §4.1）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(undoCompleteAction).mockRejectedValue(new Error("Failed to fetch"));
    renderBoard();
    selectRow(COMPLETED);

    await pressAndSettle("u");

    expect(within(taskRow(COMPLETED)).queryByText(formatClock(atJst("09:00")))).not.toBeNull();
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
    expect(screen.queryByText("取り消す")).toBeNull();
  });

  it("取り消しの保留は削除と完了の取り消しで共通の1スロット（後から来た削除が置き換える）", async () => {
    renderBoard();
    selectRow(COMPLETED);
    await pressAndSettle("u"); // 完了の取り消し → 保留は「未実行に戻しました」
    selectRow(NOT_STARTED);

    await pressAndSettle("d"); // 削除 → 保留は「削除しました」へ置き換わる

    expect(screen.queryByText(`「${COMPLETED}」を未実行に戻しました`)).toBeNull();
    expect(screen.queryByText(`「${NOT_STARTED}」を削除しました`)).not.toBeNull();
    expect(screen.getAllByText("取り消す")).toHaveLength(1);
  });
});
