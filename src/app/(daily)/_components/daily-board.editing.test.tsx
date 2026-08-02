// 盤面テスト（`daily-board.*.test.tsx`）のうち**入力欄まわり**を持つファイル
// （§3.4 / §8 / 00_共通 §2.3 / F-102 / F-203）。クイック追加と、インライン編集の検証。
// **打刻の修正（F-203）もここ**——入力欄の検証という点でタスク名・見積もりと同じ作法のため
// （打刻そのものは `punch`）。
import { act, fireEvent, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { formatClock } from "@/app/_lib/format";
import { atJst, TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";

import {
  addTaskAction,
  deleteTaskAction,
  renameTaskAction,
  updateTaskCommentAction,
  updateTaskEstimateAction,
  updateTaskPunchAction,
  type CreatingActionResult,
  type DailyActionResult,
} from "../actions";
import {
  COMPLETED,
  CREATED,
  commentInput,
  commit,
  defaultTasks,
  DELETE_OK,
  FORENOON,
  hold,
  NOT_STARTED,
  NOW,
  OK,
  press,
  quickAddInput,
  renderBoard,
  RUNNING,
  selectRow,
  setupBoard,
  type DeleteResult,
} from "../_testing/board-helpers";
import { isSelected, rowNames } from "../_testing/table-helpers";

vi.mock("../actions", async () => (await import("../_testing/action-mocks")).actionMocks());

setupBoard();

/**
 * 打刻修正（F-203）の入力欄。表示中の値ではなくプレースホルダで引く——
 * 入力欄の初期値は `formatClock` の整形結果なので、値で引くと整形の書式に縛られる
 */
function punchInput(): HTMLElement {
  return screen.getByPlaceholderText("1935");
}

describe("DailyBoard のクイック追加（§3.4 / F-102）", () => {
  it("Enter で楽観的に行を出し、欄をクリアする", () => {
    const gate = hold<CreatingActionResult>(CREATED);
    vi.mocked(addTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    const input = quickAddInput();
    fireEvent.change(input, { target: { value: "  買い物  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(vi.mocked(addTaskAction)).toHaveBeenCalledWith({ date: TEST_DATE, name: "買い物" });
    // 未分類（リスト先頭）の末尾に確定前から出る
    expect(rowNames()).toEqual(["買い物", NOT_STARTED, RUNNING, COMPLETED]);
    expect(input).toHaveProperty("value", "");
  });

  // 生成系（runSelectingCreated）の拒否経路。楽観的に出した行が残ると、存在しないタスクが
  // 画面に居座る（00_共通 §4.1 / FB-64）
  it("追加が通信できずに終わったら楽観的に出した行を消す（00_共通 §4.1）", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.mocked(addTaskAction).mockRejectedValue(new Error("Failed to fetch"));
    renderBoard();

    fireEvent.change(quickAddInput(), { target: { value: "買い物" } });
    await act(async () => {
      fireEvent.keyDown(quickAddInput(), { key: "Enter" });
    });

    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
  });

  it("空のままの Enter は何もしない（§8）", () => {
    renderBoard();

    fireEvent.change(quickAddInput(), { target: { value: "   " } });
    fireEvent.keyDown(quickAddInput(), { key: "Enter" });

    expect(vi.mocked(addTaskAction)).not.toHaveBeenCalled();
    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
  });

  // 追加欄のキー処理は `inlineEditKeyHandler` を通す（00_共通 §3: IME変換中は操作として扱わない）。
  // これが無いと、生のキー判定へ書き換えても他の追加テストは全部緑のまま通る
  it("IME変換中の Enter は追加しない（00_共通 §3）", () => {
    renderBoard();

    fireEvent.change(quickAddInput(), { target: { value: "買い物" } });
    fireEvent.keyDown(quickAddInput(), { key: "Enter", isComposing: true });

    expect(vi.mocked(addTaskAction)).not.toHaveBeenCalled();
    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
    expect(quickAddInput()).toHaveProperty("value", "買い物"); // 確定前なので欄も消えない
  });

  it("Esc は欄のフォーカスを外してリスト操作へ戻す（§3.4）", () => {
    renderBoard();

    press("a");
    // Esc の効果を見る前に、A でフォーカスが当たっていること自体を確かめる
    // （当たっていなければ「外れた」の主張は何も検証していない）
    expect(document.activeElement).toBe(quickAddInput());

    fireEvent.keyDown(quickAddInput(), { key: "Escape" });

    expect(document.activeElement).not.toBe(quickAddInput());
  });

  it("確定後は採番されたタスクを選択する（O-11 と同じ規則 / FB-29）", async () => {
    vi.mocked(addTaskAction).mockResolvedValue({ ok: true, createdId: 21 });
    const { applyServerState } = renderBoard();

    fireEvent.change(quickAddInput(), { target: { value: "買い物" } });
    await act(async () => {
      fireEvent.keyDown(quickAddInput(), { key: "Enter" });
    });
    applyServerState([...defaultTasks(), task({ id: 21, name: "買い物" })]);

    expect(isSelected("買い物")).toBe(true);
  });

  // 仮タスクのIDは連番で採る（T-63）。時刻由来（`-Date.now()`）だと同一ミリ秒内の連続追加で
  // 衝突し、片方への操作が他方を巻き添えにする。以下2件はその衝突が起きないことを見る
  // （時計を固定している＝同一ミリ秒なので、時刻由来に戻すとどちらも落ちる）
  it("確定前に2件続けて追加しても、両方が別の行として残る（T-63）", () => {
    const gate = hold<CreatingActionResult>(CREATED);
    vi.mocked(addTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    fireEvent.change(quickAddInput(), { target: { value: "買い物" } });
    fireEvent.keyDown(quickAddInput(), { key: "Enter" });
    fireEvent.change(quickAddInput(), { target: { value: "洗濯" } });
    fireEvent.keyDown(quickAddInput(), { key: "Enter" });

    expect(rowNames()).toEqual(["買い物", "洗濯", NOT_STARTED, RUNNING, COMPLETED]);
    // 選択（§5）は行のIDで決まるので、片方だけが選ばれることがIDの別々さの現れになる
    selectRow("洗濯");
    expect(isSelected("洗濯")).toBe(true);
    expect(isSelected("買い物")).toBe(false);
  });

  it("確定前の仮の行を1件だけ編集しても、もう1件は巻き添えにならない（T-63）", () => {
    const addGate = hold<CreatingActionResult>(CREATED);
    vi.mocked(addTaskAction).mockReturnValue(addGate.promise);
    const renameGate = hold<DailyActionResult>(OK);
    vi.mocked(renameTaskAction).mockReturnValue(renameGate.promise);
    renderBoard();

    fireEvent.change(quickAddInput(), { target: { value: "買い物" } });
    fireEvent.keyDown(quickAddInput(), { key: "Enter" });
    fireEvent.change(quickAddInput(), { target: { value: "洗濯" } });
    fireEvent.keyDown(quickAddInput(), { key: "Enter" });

    selectRow("洗濯");
    press("r");
    commit(screen.getByDisplayValue("洗濯"), "洗濯物");

    expect(rowNames()).toEqual(["買い物", "洗濯物", NOT_STARTED, RUNNING, COMPLETED]);
  });

  it("確定前の仮の行を1件だけ削除しても、もう1件は消えない（T-63 / O-8）", () => {
    const addGate = hold<CreatingActionResult>(CREATED);
    vi.mocked(addTaskAction).mockReturnValue(addGate.promise);
    const deleteGate = hold<DeleteResult>(DELETE_OK);
    vi.mocked(deleteTaskAction).mockReturnValue(deleteGate.promise);
    renderBoard();

    fireEvent.change(quickAddInput(), { target: { value: "買い物" } });
    fireEvent.keyDown(quickAddInput(), { key: "Enter" });
    fireEvent.change(quickAddInput(), { target: { value: "洗濯" } });
    fireEvent.keyDown(quickAddInput(), { key: "Enter" });

    selectRow("洗濯");
    press("d");

    expect(rowNames()).toEqual(["買い物", NOT_STARTED, RUNNING, COMPLETED]);
  });

  it("追加の失敗は仮の行を取り消してエラートーストを出す", async () => {
    const gate = hold<CreatingActionResult>(CREATED);
    vi.mocked(addTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    fireEvent.change(quickAddInput(), { target: { value: "買い物" } });
    fireEvent.keyDown(quickAddInput(), { key: "Enter" });
    await gate.resolve({ ok: false, message: "タスク名を入力してください" });

    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
    expect(screen.queryByText("タスク名を入力してください")).not.toBeNull();
  });
});

describe("DailyBoard のインライン編集の検証（§8 / 00_共通 §2.3）", () => {
  it("見積もりが非数値なら送信せずエラートーストを出す", () => {
    renderBoard();
    selectRow(NOT_STARTED);

    press("e");
    commit(screen.getByPlaceholderText("分"), "あとで");

    expect(vi.mocked(updateTaskEstimateAction)).not.toHaveBeenCalled();
    expect(screen.queryByText("見積もりは分（0以上の整数）で入力してください")).not.toBeNull();
  });

  it("空のタスク名は確定不可で、元の名前のまま送信しない", () => {
    renderBoard();
    selectRow(NOT_STARTED);

    press("r");
    commit(screen.getByDisplayValue(NOT_STARTED), "   ");

    expect(vi.mocked(renameTaskAction)).not.toHaveBeenCalled();
    expect(screen.queryByText(NOT_STARTED)).not.toBeNull();
  });

  it("変更なしの確定は送信しない（タスク名・見積もりとも）", () => {
    renderBoard([task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, estimateMinutes: 30 })]);
    selectRow(NOT_STARTED);

    press("r");
    commit(screen.getByDisplayValue(NOT_STARTED), NOT_STARTED);
    press("e");
    commit(screen.getByPlaceholderText("分"), "30"); // 同じ値の再確定

    expect(vi.mocked(renameTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(updateTaskEstimateAction)).not.toHaveBeenCalled();
  });

  it("コメントも変更なしの確定は送信しない（前後の空白だけの差も同値）", () => {
    renderBoard([task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, comment: "前に書いた" })]);
    selectRow(NOT_STARTED);

    press("c");
    commit(commentInput(), "前に書いた");
    press("c");
    commit(commentInput(), "  前に書いた  "); // 正規化すると同値

    expect(vi.mocked(updateTaskCommentAction)).not.toHaveBeenCalled();
  });

  /**
   * この欄は blur でも確定する（O-16）ので、Esc の取消は「編集を閉じる」だけでなく
   * **閉じたことで飛ぶ blur が書きかけを保存しない**ところまでで初めて成立する。
   * 入力欄の unmount を伴うため、行単体（`daily-list.test.tsx`）では踏めない経路
   */
  it("Esc で取り消すと書きかけは保存されず、元のコメントが残る（O-16 / 00_共通 §2.3）", () => {
    renderBoard([task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, comment: "前に書いた" })]);
    selectRow(NOT_STARTED);

    press("c");
    fireEvent.change(commentInput(), { target: { value: "書きかけ" } });
    fireEvent.keyDown(commentInput(), { key: "Escape" });

    expect(vi.mocked(updateTaskCommentAction)).not.toHaveBeenCalled();
    expect(screen.queryByText("書きかけ")).toBeNull();
    expect(screen.queryByText("前に書いた")).not.toBeNull();
  });

  // 打刻の有無を見る `B`/`F`（§3.3）と違い、コメントは状態を問わず書ける（O-16）
  it("完了タスクでも C でコメントを開ける（状態を問わない。O-16）", () => {
    renderBoard();
    selectRow(COMPLETED);

    press("c");

    expect(commentInput()).not.toBeNull();
  });

  // `C` を押して何も書かずに抜けるたびに保存＋revalidatePath が飛ぶのを防ぐ（null === null）
  it("コメントの無い行で空のまま確定しても送信しない", () => {
    renderBoard();
    selectRow(NOT_STARTED);

    press("c");
    commit(commentInput(), "");

    expect(vi.mocked(updateTaskCommentAction)).not.toHaveBeenCalled();
  });

  // FB-68 の症状を通しで固定する。フック側は「編集を開かない」、行側は「入力欄を出さない」
  // としか見ておらず、両者の合成である「キーボードが死なない」はここでしか見えない
  it("未打刻タスクの B／F はキーボード操作を止めない（FB-68）", () => {
    renderBoard();
    selectRow(NOT_STARTED);

    press("b");
    press("f");
    press("j"); // 編集状態に入っていれば全ショートカットが止まり、選択は動かない

    expect(screen.queryByPlaceholderText("1935")).toBeNull();
    expect(isSelected(RUNNING)).toBe(true);
  });

  it("打刻の修正（F-203）は不正な時刻を送信せずエラートーストを出す", () => {
    renderBoard();
    selectRow(RUNNING);

    press("b");
    commit(punchInput(), "25:99");

    expect(vi.mocked(updateTaskPunchAction)).not.toHaveBeenCalled();
    expect(screen.queryByText("時刻は HH:MM 形式で入力してください")).not.toBeNull();
  });

  it("終了時刻を開始より前へ直すと確定不可（§8: 開始 ≦ 終了）", () => {
    renderBoard();
    selectRow(COMPLETED);

    press("f");
    commit(punchInput(), "0800");

    expect(vi.mocked(updateTaskPunchAction)).not.toHaveBeenCalled();
    expect(screen.queryByText("終了時刻は開始時刻より後にしてください")).not.toBeNull();
  });

  // 引数の検証は `toHaveBeenCalledWith` を基準にし、**引数の一部だけを調べるときだけ**
  // `mock.calls[0]` を使う（入力の HH:MM が `APP_TIME_ZONE` の壁時計として解釈された結果を見る）
  it("終了時刻の修正は開始時刻を保ったまま送る（F-203）", () => {
    renderBoard();
    selectRow(COMPLETED);

    press("f");
    commit(punchInput(), "0930");

    const call = vi.mocked(updateTaskPunchAction).mock.calls[0];
    expect(call[0]).toBe(13);
    expect(call[1].startedAt).toEqual(atJst("09:00"));
    expect(call[1].endedAt).toEqual(atJst("09:30"));
    // 移動先セクションの判定は開始時刻の HH:MM で行う（§4.2-c）
    expect(call[2]).toBe(formatClock(atJst("09:00")));
  });

  it("開始時刻の修正はセクション判定用の HH:MM とクライアントの現在時刻を添えて送る（§4.2-c）", () => {
    renderBoard();
    selectRow(RUNNING);

    press("b");
    commit(punchInput(), "0915");

    const call = vi.mocked(updateTaskPunchAction).mock.calls[0];
    expect(call[0]).toBe(12);
    // HH:MM は運用タイムゾーンの壁時計として解釈する（実行環境の TZ に依らない。T-47）
    expect(call[1].startedAt).toEqual(atJst("09:15"));
    expect(call[1].endedAt).toBeNull();
    expect(call[3]).toEqual(NOW);
  });
});
