// 盤面テスト（`daily-board.*.test.tsx`）のうち**打刻とその取り消し**を持つファイル
// （F-201 / F-211 / F-212 / O-13 / O-15 / §7）。開始・終了・完了の取り消しと `U` の切り分け。
// **失敗したときの巻き戻しは `optimistic`**、打刻時刻の修正（F-203）は `editing` にある。
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { formatClock, formatDuration } from "@/app/_lib/format";
import { click } from "@/app/_testing/interactions";
import { atJst, NEXT_TEST_DATE, TEST_DATE } from "@/domain/shared/testing/clock";
import type { Task } from "@/domain/task/task";
import { task } from "@/domain/task/testing/task";

import {
  deleteTaskAction,
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
import { bundleOf } from "../_testing/factories";
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

describe("DailyBoard のバンドル割り込み警告（F-119 / 要件定義書 §5.6 / 画面定義書01 §4.4）", () => {
  const BUNDLE_NAME = "朝の立上げ";
  const BUNDLE_ID = bundleOf(BUNDLE_NAME).id;
  const MEMBER_DONE = "身支度";
  const MEMBER_RUNNING = "洗顔";
  const MEMBER_TODO = "着替え";
  const NONMEMBER = "資料作成";

  /** 完了したメンバー1件・未実行のメンバー1件・未実行の非メンバー1件（残り1件が出る最小形） */
  function bundleTasks(): Task[] {
    return [
      task({
        id: 21,
        name: MEMBER_DONE,
        bundleId: BUNDLE_ID,
        sortOrder: 1000,
        startedAt: atJst("06:00"),
        endedAt: atJst("06:10"),
      }),
      task({ id: 22, name: MEMBER_TODO, bundleId: BUNDLE_ID, sortOrder: 2000 }),
      task({ id: 23, name: NONMEMBER, sortOrder: 3000 }),
    ];
  }

  it("バンドルの途中で非メンバーを開始するとトーストで知らせる（§4.4）", async () => {
    renderBoard(bundleTasks());

    await click(within(taskRow(NONMEMBER)).getByLabelText("開始"));

    expect(screen.queryByText(`「${BUNDLE_NAME}」が途中です（残り1件）`)).not.toBeNull();
  });

  /**
   * 割り込み（O-2）＝実行中のメンバーを残したまま非メンバーを開始する形。**判定は打刻前の
   * 一覧（`orderedTasks`）を読む**——楽観的更新（`optimistic.ts` の `"start"`）は割り込まれた
   * 実行中タスクへ終了時刻を入れるので、判定が更新後の値を見ると未完了の数が1減り、
   * 未完了メンバーが実行中の1件だけのときは警告ごと消える
   */
  it("実行中のメンバーに割り込んで非メンバーを開始しても知らせる（実行中のメンバーを未完了に数える）", async () => {
    renderBoard([
      task({
        id: 21,
        name: MEMBER_RUNNING,
        bundleId: BUNDLE_ID,
        sortOrder: 1000,
        startedAt: atJst("10:00"),
      }),
      task({ id: 23, name: NONMEMBER, sortOrder: 2000 }),
    ]);

    await click(within(taskRow(NONMEMBER)).getByLabelText("開始"));

    expect(screen.queryByText(`「${BUNDLE_NAME}」が途中です（残り1件）`)).not.toBeNull();
  });

  it("割り込まれた実行中メンバーと未実行メンバーを合わせて数える（残り2件）", async () => {
    renderBoard([
      task({
        id: 21,
        name: MEMBER_RUNNING,
        bundleId: BUNDLE_ID,
        sortOrder: 1000,
        startedAt: atJst("10:00"),
      }),
      task({ id: 22, name: MEMBER_TODO, bundleId: BUNDLE_ID, sortOrder: 2000 }),
      task({ id: 23, name: NONMEMBER, sortOrder: 3000 }),
    ]);

    await click(within(taskRow(NONMEMBER)).getByLabelText("開始"));

    expect(screen.queryByText(`「${BUNDLE_NAME}」が途中です（残り2件）`)).not.toBeNull();
  });

  it("同じバンドルの別メンバーを開始しても知らせない", async () => {
    renderBoard(bundleTasks());

    await click(within(taskRow(MEMBER_TODO)).getByLabelText("開始"));

    expect(screen.queryByText(/が途中です/)).toBeNull();
  });

  it("中断（I）では知らせない（開始操作ではないため）", () => {
    renderBoard([
      task({
        id: 21,
        name: MEMBER_DONE,
        bundleId: BUNDLE_ID,
        sortOrder: 1000,
        startedAt: atJst("06:00"),
        endedAt: atJst("06:10"),
      }),
      task({
        id: 22,
        name: RUNNING,
        bundleId: BUNDLE_ID,
        sortOrder: 2000,
        startedAt: atJst("10:00"),
      }),
    ]);
    selectRow(RUNNING);

    press("i");

    expect(screen.queryByText(/が途中です/)).toBeNull();
  });

  /**
   * 契機は開始打刻の全経路（§4.4）——その否定側の土台。**直前に実行したのがメンバーで、
   * 未完了のメンバーが1件残る**並びに非メンバーを1件足す。誤って開始以外を契機に加えると
   * この形で鳴るので、鳴らないことがそのまま検査になる
   */
  function afterMemberTasks(nonMember: Task): Task[] {
    return [
      task({
        id: 21,
        name: MEMBER_DONE,
        bundleId: BUNDLE_ID,
        sortOrder: 1000,
        startedAt: atJst("09:30"),
        endedAt: atJst("09:40"),
      }),
      task({ id: 22, name: MEMBER_TODO, bundleId: BUNDLE_ID, sortOrder: 2000 }),
      nonMember,
    ];
  }

  it("終了打刻では知らせない（開始操作ではないため）", async () => {
    renderBoard(
      afterMemberTasks(
        task({ id: 23, name: NONMEMBER, sortOrder: 3000, startedAt: atJst("10:00") })
      )
    );

    await click(within(taskRow(NONMEMBER)).getByLabelText("終了"));

    expect(vi.mocked(finishTaskAction)).toHaveBeenCalledWith(23, NOW);
    expect(screen.queryByText(/が途中です/)).toBeNull();
  });

  it("開始打刻の取り消し（U）では知らせない", async () => {
    renderBoard(
      afterMemberTasks(
        task({ id: 23, name: NONMEMBER, sortOrder: 3000, startedAt: atJst("10:00") })
      )
    );
    selectRow(NONMEMBER);

    await pressAndSettle("u");

    expect(vi.mocked(undoStartAction)).toHaveBeenCalledWith(23, NOW);
    expect(screen.queryByText(/が途中です/)).toBeNull();
  });

  it("完了の取り消し（U）でも知らせない", async () => {
    renderBoard(
      afterMemberTasks(
        task({
          id: 23,
          name: NONMEMBER,
          sortOrder: 3000,
          startedAt: atJst("09:00"),
          endedAt: atJst("09:20"),
        })
      )
    );
    selectRow(NONMEMBER);

    await pressAndSettle("u");

    expect(vi.mocked(undoCompleteAction)).toHaveBeenCalledWith(23, NOW);
    expect(screen.queryByText(/が途中です/)).toBeNull();
  });

  // 警告は通知（notice）で出し、取り消しの保留（pendingUndo）とは別スロットに置く（§4.4）
  it("削除の取り消しが保留中でも、警告は保留を消さずに並ぶ", async () => {
    const extra = task({ id: 24, name: "雑務", sortOrder: 4000 });
    vi.mocked(deleteTaskAction).mockResolvedValue({ ok: true, deleted: extra });
    renderBoard([...bundleTasks(), extra]);
    selectRow("雑務");
    await pressAndSettle("d");

    await click(within(taskRow(NONMEMBER)).getByLabelText("開始"));

    expect(screen.queryByText("「雑務」を削除しました")).not.toBeNull();
    expect(screen.queryByText(`「${BUNDLE_NAME}」が途中です（残り1件）`)).not.toBeNull();
  });

  it("複製して開始（完了タスクの Enter）でも知らせる", () => {
    // 複製元（非メンバー・完了済み）は id=null で除外されないため配列に残る。
    // 「直前」は表示順ではなく開始時刻の最大で決まるので、メンバーの開始をそれより後にしておく
    renderBoard([
      task({
        id: 23,
        name: COMPLETED,
        sortOrder: 500,
        startedAt: atJst("09:00"),
        endedAt: atJst("09:20"),
      }),
      task({
        id: 21,
        name: MEMBER_DONE,
        bundleId: BUNDLE_ID,
        sortOrder: 1000,
        startedAt: atJst("09:30"),
        endedAt: atJst("09:40"),
      }),
      task({ id: 22, name: MEMBER_TODO, bundleId: BUNDLE_ID, sortOrder: 2000 }),
    ]);
    selectRow(COMPLETED);

    press("Enter");

    expect(screen.queryByText(`「${BUNDLE_NAME}」が途中です（残り1件）`)).not.toBeNull();
  });

  it("確定待ちの操作が飛んでいる間は複製して開始が抑止され、警告も出ない（開始していないのに鳴らない）", () => {
    // 複製して開始（F-208）は楽観的更新をしない「確定を待つ操作」なので、別の確定待ち操作
    // （ここでは中断 I）が飛んでいる間は runGuarded に抑止される。抑止＝発火していないので、
    // 通知（開始したことにする前提の処理）も出てはいけない
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(suspendTaskAction).mockReturnValue(gate.promise);
    renderBoard([
      task({
        id: 23,
        name: COMPLETED,
        sortOrder: 500,
        startedAt: atJst("09:00"),
        endedAt: atJst("09:20"),
      }),
      task({
        id: 21,
        name: MEMBER_DONE,
        bundleId: BUNDLE_ID,
        sortOrder: 1000,
        startedAt: atJst("09:30"),
        endedAt: atJst("09:40"),
      }),
      task({ id: 22, name: MEMBER_TODO, bundleId: BUNDLE_ID, sortOrder: 2000 }),
      // 中断させる実行中タスク。開始時刻をメンバー(09:30)より前にして、「直前」の判定を
      // このタスクに奪わせない（後ろだと非メンバーの直前として拾われ、抑止と無関係に null になる）
      task({ id: 24, name: RUNNING, sortOrder: 3000, startedAt: atJst("08:00") }),
    ]);
    selectRow(RUNNING);
    press("i"); // 中断（確定待ち）を発火させ、commitInFlight を立てる

    selectRow(COMPLETED);
    press("Enter"); // 複製して開始も確定待ちのため、この間は抑止される

    expect(vi.mocked(duplicateAndStartTaskAction)).not.toHaveBeenCalled();
    expect(screen.queryByText(/が途中です/)).toBeNull();
  });

  it("判定に失敗しても打刻は成立する（打刻を巻き添えにしない）", async () => {
    // フィクスチャに無い bundleId（名前が引けない状況）。未完了のメンバーも残し、
    // remaining=0 で早期に null になる経路と区別する
    const UNKNOWN_BUNDLE_ID = 999;
    renderBoard([
      task({
        id: 21,
        name: MEMBER_DONE,
        bundleId: UNKNOWN_BUNDLE_ID,
        sortOrder: 1000,
        startedAt: atJst("06:00"),
        endedAt: atJst("06:10"),
      }),
      task({ id: 24, name: MEMBER_TODO, bundleId: UNKNOWN_BUNDLE_ID, sortOrder: 1500 }),
      task({ id: 22, name: NONMEMBER, sortOrder: 2000 }),
    ]);

    await click(within(taskRow(NONMEMBER)).getByLabelText("開始"));

    expect(screen.queryByText(/が途中です/)).toBeNull();
    expect(vi.mocked(startTaskAction)).toHaveBeenCalledWith(22, NOW);
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
    await pressAndSettle("d"); // 削除で選択は直後の行（＝実行中タスク）へ移る（§5）

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

describe("DailyBoard の未来日（§7: 今日以前の表示日でだけ打刻できる）", () => {
  /**
   * 表示日が翌日＝未来日の盤面。行の状態は既定のまま（未実行・実行中・完了を一通り持つ）。
   * 実行中・完了の行は §7 の下では新たに作れないが、**キー経路のガードを状態ごとに測る**ために置く
   * （打刻の日付は論理日に合わせて翌日へ寄せる。判定に使うのは props の `date` であってこの値ではない）
   */
  function renderFutureBoard() {
    return renderBoard(
      [
        task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, sortOrder: 1000 }),
        task({
          id: 12,
          name: RUNNING,
          sectionId: FORENOON.id,
          sortOrder: 2000,
          taskDate: NEXT_TEST_DATE,
          startedAt: atJst("10:00", NEXT_TEST_DATE),
        }),
        task({
          id: 13,
          name: COMPLETED,
          sectionId: AFTERNOON.id,
          sortOrder: 1000,
          taskDate: NEXT_TEST_DATE,
          startedAt: atJst("09:00", NEXT_TEST_DATE),
          endedAt: atJst("09:20", NEXT_TEST_DATE),
        }),
      ],
      { date: NEXT_TEST_DATE, today: TEST_DATE, isToday: false }
    );
  }

  it("打刻ボタンを出さない（board → list → row へ伝わっている。状態ごとの網羅は task-row.test.tsx）", () => {
    renderFutureBoard();

    expect(within(cellsOf(taskRow(NOT_STARTED)).punch).queryByRole("button")).toBe(null);
  });

  it.each([NOT_STARTED, RUNNING, COMPLETED])(
    "%s を選んで Enter を押しても打刻しない（ボタンが無いぶんキーだけが残る経路）",
    (name) => {
      renderFutureBoard();
      selectRow(name);

      press("Enter");

      expect(vi.mocked(startTaskAction)).not.toHaveBeenCalled();
      expect(vi.mocked(finishTaskAction)).not.toHaveBeenCalled();
      expect(vi.mocked(duplicateAndStartTaskAction)).not.toHaveBeenCalled();
    }
  );

  it("実行中タスクを選んで I を押しても中断しない（中断は終了打刻を含む。O-4 / §7）", () => {
    renderFutureBoard();
    selectRow(RUNNING);

    press("i");

    expect(vi.mocked(suspendTaskAction)).not.toHaveBeenCalled();
  });

  it("打刻を消す側は塞がない（U での開始の取り消しは日付を問わない。O-13）", async () => {
    renderFutureBoard();
    selectRow(RUNNING);

    await pressAndSettle("u");

    expect(vi.mocked(undoStartAction)).toHaveBeenCalled();
  });

  it.each([
    ["過去日", TEST_DATE, NEXT_TEST_DATE],
    ["当日", TEST_DATE, TEST_DATE],
  ])("%s は塞がない（過去日の打刻は深夜作業のために残す）", (_label, date, today) => {
    renderBoard(defaultTasks(), { date, today, isToday: date === today });
    selectRow(NOT_STARTED);

    press("Enter");

    expect(vi.mocked(startTaskAction)).toHaveBeenCalledWith(11, NOW);
  });
});
