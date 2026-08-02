// 盤面テスト（`daily-board.*.test.tsx`）のうち**行そのものへの操作**を持つファイル
// （O-5 / O-7 / O-8 / O-12 / F-115 / §8）。削除と取り消し、モード・プロジェクト・
// セクションの割り当て、行メニューからの導線と、その結果の通知。
// **入口はキー（`D`/`M`/`P`/`S`）と行メニューの両方**——同じ操作に2つの経路がある（§5）。
import { screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { click, clickWithoutServer } from "@/app/_testing/interactions";
import { TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";

import {
  createRoutineFromTaskAction,
  deleteTaskAction,
  duplicateAndStartTaskAction,
  finishTaskAction,
  postponeTaskAction,
  restoreTaskAction,
  setTaskModeAction,
  setTaskProjectAction,
  setTaskSectionAction,
  startTaskAction,
  undoStartAction,
  type DailyActionResult,
} from "../actions";
import { modeOf, projectOf } from "../_testing/factories";
import {
  AFTERNOON,
  COMPLETED,
  defaultTasks,
  DELETE_OK,
  FORENOON,
  hold,
  NOT_STARTED,
  OK,
  press,
  pressAndSettle,
  renderBoard,
  RUNNING,
  selectRow,
  setupBoard,
  type DeleteResult,
} from "../_testing/board-helpers";
import { rowNames, taskRow } from "../_testing/table-helpers";

vi.mock("../actions", async () => (await import("../_testing/action-mocks")).actionMocks());

setupBoard();

// 割り当ての対象。モードは**先頭の候補を選ばない**（「常に先頭を送る」実装でも緑になるため）
const TARGET_MODE = modeOf("生活");
const TARGET_PROJECT = projectOf("サイト改善");

/**
 * 行メニュー（O-7/O-8 の導線）から項目を選ぶ。1回目は開くだけ、
 * 2回目は**項目によっては Server Action を呼ぶ**（先送りは呼び、ルーチン化はポップオーバーを開く）ので `click` に通す
 */
async function chooseRowMenu(name: string, label: string) {
  clickWithoutServer(within(taskRow(name)).getByLabelText("行メニュー"));
  await click(screen.getByRole("button", { name: label }));
}

/**
 * 選択ポップオーバー（O-5）の候補を選ぶ。候補は `data-option-index` を持つので、
 * 同名の行内ボタン（行のセクション表記など）と混ざらないようにそこで絞る。
 * セクション候補は名前の右に時間帯が付く（FB-46）ため前方一致で照合する
 */
async function chooseOption(labelPrefix: string) {
  const option = screen
    .getAllByRole("button")
    .find(
      (button) =>
        button.dataset.optionIndex !== undefined &&
        (button.textContent ?? "").startsWith(labelPrefix)
    );
  if (option === undefined) throw new Error(`候補が見つかりません: ${labelPrefix}`);
  await click(option);
}

describe("DailyBoard の削除と取り消し（O-8 / F-115）", () => {
  it("削除は行を即座に消し、確定後に取り消せる Undo トーストを出す", async () => {
    const deleted = defaultTasks()[0];
    const gate = hold<DeleteResult>(DELETE_OK);
    vi.mocked(deleteTaskAction).mockReturnValue(gate.promise);
    const { applyServerState } = renderBoard();
    selectRow(NOT_STARTED);

    press("d");
    expect(rowNames()).toEqual([RUNNING, COMPLETED]); // サーバ確定前に消える

    await gate.resolve({ ok: true, deleted });
    applyServerState(defaultTasks().filter((t) => t.id !== deleted.id));

    expect(rowNames()).toEqual([RUNNING, COMPLETED]);
    expect(screen.queryByText(`「${NOT_STARTED}」を削除しました`)).not.toBeNull();
    expect(screen.queryByText("取り消す")).not.toBeNull();
  });

  it("Undo トーストの「取り消す」で削除したタスクを復元する", async () => {
    renderBoard();
    selectRow(NOT_STARTED);
    await pressAndSettle("d");

    await click(screen.getByText("取り消す"));

    // 復元は削除で返ってきたタスクそのものを送る（並びも戻すため）
    expect(vi.mocked(restoreTaskAction)).toHaveBeenCalledWith(
      defaultTasks().find((t) => t.id === 11)
    );
    expect(screen.queryByText(`「${NOT_STARTED}」を削除しました`)).toBeNull();
  });

  it("取り消し自体が失敗したらエラートーストを出す", async () => {
    vi.mocked(restoreTaskAction).mockResolvedValue({ ok: false, message: "保存に失敗しました" });
    renderBoard();
    selectRow(NOT_STARTED);
    await pressAndSettle("d");

    await click(screen.getByText("取り消す"));

    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
  });

  it("削除の失敗は行を戻してエラートーストだけを出す（Undo は出さない）", async () => {
    const gate = hold<DeleteResult>(DELETE_OK);
    vi.mocked(deleteTaskAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("d");
    expect(rowNames()).toEqual([RUNNING, COMPLETED]);
    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
    expect(screen.queryByText("取り消す")).toBeNull();
  });

  // Undo の保留は成功時だけ置く（`callAction` の内側）。拒否でも置いてしまうと、
  // 実際には消えていない行の「取り消す」が押せる（00_共通 §4.1 / FB-64）
  it("削除が通信できずに終わったら行を戻し、Undo も出さない（00_共通 §4.1）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(deleteTaskAction).mockRejectedValue(new Error("Failed to fetch"));
    renderBoard();
    selectRow(NOT_STARTED);

    await pressAndSettle("d");

    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
    expect(screen.queryByText("取り消す")).toBeNull();
  });

  it("削除の取り消しが通信できずに終わってもエラートーストを出す（00_共通 §4.1）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(restoreTaskAction).mockRejectedValue(new Error("Failed to fetch"));
    renderBoard();
    selectRow(NOT_STARTED);
    await pressAndSettle("d");

    await click(screen.getByText("取り消す"));

    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
  });

  it("打刻済みタスクの削除は確認を挟み、キャンセルすると削除しない（O-8）", async () => {
    // スタブではなく spy にする（afterEach の restoreAllMocks で本物へ戻り、
    // 後続のテストに「常に false を返す confirm」が residue として残らない）
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderBoard();

    await chooseRowMenu(COMPLETED, "削除");

    expect(confirm).toHaveBeenCalledWith(`「${COMPLETED}」は打刻済みです。削除しますか？`);
    expect(vi.mocked(deleteTaskAction)).not.toHaveBeenCalled();
    expect(rowNames()).toContain(COMPLETED);
  });
});

describe("DailyBoard の割り当て（O-5: モード・プロジェクト・セクション）", () => {
  it("モードの割り当ては楽観的に反映し、失敗すると未設定へ戻す", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(setTaskModeAction).mockReturnValue(gate.promise);
    // タスクの ID をマスタの ID と重ならない値で描く（下のプロジェクトと同じ理由）
    renderBoard([task({ id: 42, name: NOT_STARTED, sectionId: FORENOON.id })]);
    selectRow(NOT_STARTED);

    press("m");
    await chooseOption(TARGET_MODE.name);

    expect(vi.mocked(setTaskModeAction)).toHaveBeenCalledWith(42, TARGET_MODE.id);
    expect(within(taskRow(NOT_STARTED)).queryByLabelText(`モード（${TARGET_MODE.name}）`)).not.toBeNull();

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(within(taskRow(NOT_STARTED)).queryByLabelText("モード（未設定）")).not.toBeNull();
  });

  it("プロジェクトの割り当てもモードと同じ規則で楽観的に反映する（O-5 / F-402）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(setTaskProjectAction).mockReturnValue(gate.promise);
    // タスクの ID をマスタの ID と重ならない値で描く。既定タスク（id 11）のままだと
    // `サイト改善` の ID と同値になり、`(taskId, projectId)` を取り違えた実装でも緑になる
    renderBoard([task({ id: 41, name: NOT_STARTED, sectionId: FORENOON.id })]);
    selectRow(NOT_STARTED);

    press("p");
    await chooseOption(TARGET_PROJECT.name);

    expect(vi.mocked(setTaskProjectAction)).toHaveBeenCalledWith(41, TARGET_PROJECT.id);
    expect(
      within(taskRow(NOT_STARTED)).queryByLabelText(`プロジェクト（${TARGET_PROJECT.name}）`)
    ).not.toBeNull();
  });

  it("セクションの割り当ては移動先の末尾へ楽観的に動かし、失敗すると元の位置へ戻す（O-5 / §4.3）", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(setTaskSectionAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("s");
    await chooseOption(AFTERNOON.name);

    expect(vi.mocked(setTaskSectionAction)).toHaveBeenCalledWith({
      taskId: 11,
      date: TEST_DATE,
      sectionId: AFTERNOON.id,
    });
    expect(rowNames()).toEqual([RUNNING, COMPLETED, NOT_STARTED]);

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
  });

  /**
   * F-112 のキー操作を board 段で通す唯一のテスト。確定の Enter で打刻が起きないことも見るが、
   * これを守っている2つの盾（ポップオーバー側の `stopPropagation`（FB-42）と、ショートカット側の
   * `editing !== null` ガード）のうち **jsdom で固定できるのは後者だけ**——前者だけを外しても
   * act のバッチにより `editing` が古いまま残り、打刻は発火しない（実測）。
   * FB-42 が捉えた「再レンダーとリスナー再登録の隙間」は実ブラウザでしか再現しないので段3送り
   */
  it("ポップオーバーは J/K と Enter でも選べ、確定の Enter で打刻は起きない（F-112）", () => {
    renderBoard();
    selectRow(NOT_STARTED);

    press("s"); // 現在値（午前）がハイライトされた状態で開く
    press("j"); // 次の候補（午後）へ
    press("Enter");

    expect(vi.mocked(setTaskSectionAction)).toHaveBeenCalledWith({
      taskId: 11,
      date: TEST_DATE,
      sectionId: AFTERNOON.id,
    });
    expect(vi.mocked(startTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(finishTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(duplicateAndStartTaskAction)).not.toHaveBeenCalled();
  });
});

describe("DailyBoard の通知と行メニュー（画面定義書01 §8 / O-7 / O-12）", () => {
  it("ルーチン化（O-12）はサーバ確定を待って完了通知を出す", async () => {
    renderBoard();

    await chooseRowMenu(NOT_STARTED, "ルーチン化");
    await click(screen.getByRole("button", { name: "作成" }));

    expect(vi.mocked(createRoutineFromTaskAction)).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ scheduledStartTime: "09:00" })
    );
    expect(
      screen.queryByText(`「${NOT_STARTED}」をルーチン化しました（明日から展開）`)
    ).not.toBeNull();
  });

  it("ルーチン化が失敗したらエラートーストを出す（§4.1）", async () => {
    vi.mocked(createRoutineFromTaskAction).mockResolvedValue({
      ok: false,
      message: "見積もりを入力してからルーチン化してください",
    });
    renderBoard();

    await chooseRowMenu(NOT_STARTED, "ルーチン化");
    await click(screen.getByRole("button", { name: "作成" }));

    expect(screen.queryByText("見積もりを入力してからルーチン化してください")).not.toBeNull();
    expect(screen.queryByText(/ルーチン化しました/)).toBeNull();
  });

  it("ルーチン化が通信できずに終わったら完了通知を出さない（00_共通 §4.1）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(createRoutineFromTaskAction).mockRejectedValue(new Error("Failed to fetch"));
    renderBoard();

    await chooseRowMenu(NOT_STARTED, "ルーチン化");
    await click(screen.getByRole("button", { name: "作成" }));

    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
    expect(screen.queryByText(/ルーチン化しました/)).toBeNull();
  });

  it("完了通知トーストは × で閉じられる（00_共通 §2.2）", async () => {
    renderBoard();

    await chooseRowMenu(NOT_STARTED, "ルーチン化");
    await click(screen.getByRole("button", { name: "作成" }));
    clickWithoutServer(screen.getByLabelText("閉じる"));

    expect(screen.queryByText(/ルーチン化しました/)).toBeNull();
  });

  it("Undo トーストを × で閉じると保留も破棄され、U は選択行の状態で切り分けに戻る（O-13 / 00_共通 §2.2）", async () => {
    const { applyServerState } = renderBoard();
    selectRow(NOT_STARTED);
    await pressAndSettle("d");
    applyServerState(defaultTasks().filter((t) => t.id !== 11)); // 選択は現在地（実行中）へ移る

    clickWithoutServer(screen.getByLabelText("閉じる"));
    press("u"); // 保留が無くなったので選択行（削除後は現在地＝実行中タスク）の切り分けへ

    expect(vi.mocked(restoreTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(undoStartAction)).toHaveBeenCalledTimes(1);
  });

  it("先送りが失敗したらエラートーストを出す（O-7）", async () => {
    vi.mocked(postponeTaskAction).mockResolvedValue({
      ok: false,
      message: "先送りできるのは未実行タスクだけです",
    });
    renderBoard();

    await chooseRowMenu(NOT_STARTED, "翌日へ先送り");

    expect(screen.queryByText("先送りできるのは未実行タスクだけです")).not.toBeNull();
  });

  it("先送り（O-7）は行メニューから実行し、楽観的更新はしない", async () => {
    const gate = hold<DailyActionResult>(OK);
    vi.mocked(postponeTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    await chooseRowMenu(NOT_STARTED, "翌日へ先送り");

    expect(vi.mocked(postponeTaskAction)).toHaveBeenCalledWith(11);
    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
  });
});
