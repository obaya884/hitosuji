import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { Section } from "@/domain/section/section";
import { formatClock } from "@/app/_lib/format";
import { groupTasksBySection } from "@/domain/task/daily-list";
import type { Task } from "@/domain/task/task";
import type { CompletionSnapshot } from "@/usecases/task/punch-usecases";
import {
  addTaskAction,
  createRoutineFromTaskAction,
  deleteTaskAction,
  duplicateAndStartTaskAction,
  duplicateTaskAction,
  finishTaskAction,
  moveTaskByStepAction,
  postponeTaskAction,
  renameTaskAction,
  restoreCompletionAction,
  restoreTaskAction,
  setTaskModeAction,
  setTaskProjectAction,
  setTaskSectionAction,
  startTaskAction,
  suspendTaskAction,
  undoCompleteAction,
  undoStartAction,
  updateTaskEstimateAction,
  updateTaskPunchAction,
  type CreatingActionResult,
  type DailyActionResult,
} from "../actions";
import { DailyBoard } from "./daily-board";

// アーキテクチャ定義書 §8「偽物を置いてよい境界」が許す2つだけを偽物にする。
// - `../actions`: `"use server"` の先が pg.Pool と revalidatePath に届くため素の jsdom では描画すらできない。
//   目的は「呼ばれたか」の検証ではなく、成功・失敗のどちらを返すかを固定して楽観的更新（N-01）と
//   ロールバックの両分岐を通すこと。返り値は本物と同じ契約に固定する（下の `vi.mocked(...)` が
//   本物のシグネチャで型検査するので、契約を外した偽物は build で落ちる）
// - `next/navigation`: アプリのルータ文脈の外では本物が動かない
// 内側の協力者（domain・DailyList・useDailyShortcuts・Toast など）はすべて本物を使う
vi.mock("../actions", () => ({
  addTaskAction: vi.fn(),
  createRoutineFromTaskAction: vi.fn(),
  deleteTaskAction: vi.fn(),
  duplicateAndStartTaskAction: vi.fn(),
  duplicateTaskAction: vi.fn(),
  finishTaskAction: vi.fn(),
  moveTaskByStepAction: vi.fn(),
  postponeTaskAction: vi.fn(),
  renameTaskAction: vi.fn(),
  restoreCompletionAction: vi.fn(),
  restoreTaskAction: vi.fn(),
  setTaskModeAction: vi.fn(),
  setTaskProjectAction: vi.fn(),
  setTaskSectionAction: vi.fn(),
  startTaskAction: vi.fn(),
  suspendTaskAction: vi.fn(),
  undoCompleteAction: vi.fn(),
  undoStartAction: vi.fn(),
  updateTaskEstimateAction: vi.fn(),
  updateTaskPunchAction: vi.fn(),
}));

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

/** jsdom に無い API を局所的に補う（幾何の判定そのものは段3＝ブラウザテスト送り） */
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

const DATE = "2026-07-26";
const [YEAR, MONTH, DAY] = DATE.split("-").map(Number);

/**
 * 表示日の壁時計（利用者のローカル時刻）から Date を作る。
 *
 * 打刻の修正（F-203 / `applyClockTime`）は入力の `HH:MM` を**ローカル時刻**として解釈するので、
 * テストデータも壁時計で組まないと「開始より前の時刻」といった主張が実行環境の TZ で反転する
 * （UTC の CI だけ落ちる）。一方で表示（`formatClock`）は `APP_TIME_ZONE` 固定なので、
 * **画面に出る時刻の期待値はリテラルで書かず `formatClock(at(...))` で組み立てる**
 */
function at(hhmm: string): Date {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return new Date(YEAR, MONTH - 1, DAY, hours, minutes);
}

/** 打刻はクライアントの現在時刻を送る（§7）ので、時計を固定して観測できるようにする */
const NOW = at("10:30");

function makeTask(over: Partial<Task> & { id: number; name: string }): Task {
  return {
    taskDate: DATE,
    // 既定は未設定（0分）。見積もりを見るテストは値を明示する（暗黙の既定に寄りかからない）
    estimateMinutes: 0,
    sectionId: null,
    modeId: null,
    projectId: null,
    sortOrder: 1000,
    startedAt: null,
    endedAt: null,
    comment: null,
    routineId: null,
    splitParentId: null,
    postponedCount: 0,
    ...over,
  };
}

const SECTIONS: readonly Section[] = [
  { id: 1, name: "午前", startTime: "09:00", isArchived: false },
  { id: 2, name: "午後", startTime: "13:00", isArchived: false },
];
const MODES: readonly Mode[] = [{ id: 1, name: "集中", color: "#336699", isArchived: false }];
const PROJECTS: readonly Project[] = [{ id: 1, name: "改善", isArchived: false }];

const NOT_STARTED = "資料作成";
const RUNNING = "定例会議";
const COMPLETED = "レビュー";

/** 未実行・実行中・完了が1件ずつある1日（表示順は 午前[未実行, 実行中] → 午後[完了]） */
function defaultTasks(): Task[] {
  return [
    makeTask({ id: 11, name: NOT_STARTED, sectionId: 1, sortOrder: 1000 }),
    makeTask({ id: 12, name: RUNNING, sectionId: 1, sortOrder: 2000, startedAt: at("10:00") }),
    makeTask({
      id: 13,
      name: COMPLETED,
      sectionId: 2,
      sortOrder: 1000,
      startedAt: at("09:00"),
      endedAt: at("09:20"),
    }),
  ];
}

/** 完了の取り消し（O-15）が返す復帰用スナップショット（データモデル定義書 §4.7 の4列） */
const SNAPSHOT: CompletionSnapshot = {
  taskId: 13,
  startedAt: at("09:00"),
  endedAt: at("09:20"),
  sectionId: 2,
  sortOrder: 1000,
};

// 返り値が ActionResult でないアクションの型（`hold` と mock の記述を1行に収める）
type DeleteResult = Awaited<ReturnType<typeof deleteTaskAction>>;
type UndoCompleteResult = Awaited<ReturnType<typeof undoCompleteAction>>;

// アクションの成功値。既定の解決値（beforeEach）と `hold` の保険（settleOnCleanup）で共用する
const OK: DailyActionResult = { ok: true };
const CREATED: CreatingActionResult = { ok: true, createdId: 99 };
const DELETE_OK: DeleteResult = { ok: true, deleted: makeTask({ id: 0, name: "片付け" }) };
const UNCOMPLETE_OK: UndoCompleteResult = { ok: true, snapshot: SNAPSHOT };

type BoardProps = ComponentProps<typeof DailyBoard>;

function boardProps(tasks: readonly Task[], over: Partial<BoardProps>): BoardProps {
  return {
    date: DATE,
    today: DATE,
    isToday: true,
    groups: groupTasksBySection(tasks, SECTIONS),
    modes: MODES,
    projects: PROJECTS,
    sections: SECTIONS,
    staleRunningTask: null,
    ...over,
  };
}

function renderBoard(tasks: readonly Task[] = defaultTasks(), over: Partial<BoardProps> = {}) {
  const view = render(<DailyBoard {...boardProps(tasks, over)} />);
  return {
    ...view,
    /** サーバ確定後の再取得（revalidatePath による Server Component の再描画）を模す */
    applyServerState: (next: readonly Task[]) =>
      view.rerender(<DailyBoard {...boardProps(next, over)} />),
  };
}

/** `hold` が積む保険。afterEach が未解決の保留をまとめて解決する */
const heldGates: (() => Promise<void>)[] = [];

/**
 * Server Action を保留させ、解決の瞬間をテストが握る（楽観的更新の「確定前」を観測するため）。
 * React は未完了の非同期アクションを束ねて扱うので、**解決し忘れた保留は後続テストの巻き戻しまで
 * 止めてしまう**（嘘の赤になる）。取りこぼしても壊れないよう afterEach が保険で解決する
 *
 * @param settleOnCleanup afterEach の保険で使う値（テスト本体が `resolve` すれば使われない）。
 *   上の成功値定数（`OK` / `CREATED` / `DELETE_OK` / `UNCOMPLETE_OK`）を渡す
 */
function hold<T>(settleOnCleanup: T) {
  let settle: (value: T) => void = () => {};
  const promise = new Promise<T>((resolve) => {
    settle = resolve;
  });
  let done = false;
  const resolve = async (value: T) => {
    done = true;
    // 解決に続く再描画（トースト・ロールバック）まで流す
    await act(async () => {
      settle(value);
    });
  };
  heldGates.push(async () => {
    if (!done) await resolve(settleOnCleanup);
  });
  return { promise, resolve };
}

/** 表示順のタスク行（列見出し・セクション見出し行は除く） */
function taskRows(): HTMLElement[] {
  return screen.getAllByRole("row").filter((tr) => tr.querySelectorAll("td").length >= 2);
}

function row(name: string): HTMLElement {
  const tr = screen.getByRole("button", { name }).closest("tr");
  if (tr === null) throw new Error(`行が見つかりません: ${name}`);
  return tr;
}

/** 表示順 index 番目のタスク行。複製（O-11/O-14）のように同名の行が並ぶ場合に使う */
function rowAt(index: number): HTMLElement {
  const rows = taskRows();
  if (rows[index] === undefined) throw new Error(`${index} 番目の行がありません`);
  return rows[index];
}

/** 表示順のタスク名。並び替え・追加・削除の検証に使う */
function rowNames(): string[] {
  return taskRows().flatMap((tr) => {
    const nameButton = tr.querySelectorAll("td")[1].querySelector("button");
    return nameButton === null ? [] : [nameButton.textContent ?? ""];
  });
}

/** 選択行の強調（§5）。行の地色で示す */
function isSelected(target: string | HTMLElement): boolean {
  const tr = typeof target === "string" ? row(target) : target;
  return tr.classList.contains("bg-accent-weak");
}

/** クリックでの行選択（§5: マウス操作とキーボード操作は等価） */
function selectRow(name: string) {
  fireEvent.click(row(name));
}

/** グローバルショートカット（§6）。フックが window で購読しているので body へ送る */
function press(key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(document.body, { key, ...init });
}

/** 解決済みの Server Action の後始末（トースト表示・選択移動）まで流す */
async function settleActions() {
  await act(async () => {});
}

async function pressAndSettle(key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    press(key, init);
  });
}

async function clickAndSettle(element: HTMLElement) {
  await act(async () => {
    fireEvent.click(element);
  });
}

function quickAddInput(): HTMLElement {
  return screen.getByPlaceholderText("タスク名を入力して Enter で追加");
}

/**
 * 打刻修正（F-203）の入力欄。表示中の値ではなくプレースホルダで引く——
 * 表示は `APP_TIME_ZONE` 固定の整形なので、値で引くとテストが実行環境の TZ に縛られる
 */
function punchInput(): HTMLElement {
  return screen.getByPlaceholderText("1935");
}

/** 行メニュー（O-7/O-8 の導線）から項目を選ぶ */
function chooseRowMenu(name: string, label: string) {
  fireEvent.click(within(row(name)).getByLabelText("行メニュー"));
  fireEvent.click(screen.getByRole("button", { name: label }));
}

/**
 * 選択ポップオーバー（O-5）の候補を選ぶ。候補は `data-option-index` を持つので、
 * 同名の行内ボタン（行のセクション表記など）と混ざらないようにそこで絞る。
 * セクション候補は名前の右に時間帯が付く（FB-46）ため前方一致で照合する
 */
function chooseOption(labelPrefix: string) {
  const option = screen
    .getAllByRole("button")
    .find(
      (button) =>
        button.dataset.optionIndex !== undefined &&
        (button.textContent ?? "").startsWith(labelPrefix)
    );
  if (option === undefined) throw new Error(`候補が見つかりません: ${labelPrefix}`);
  fireEvent.click(option);
}

/** インライン編集の確定（00_共通 §2.3: Enter または blur で確定） */
function commit(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", ResizeObserverStub);
  // 選択行のスクロール追従（§5）は jsdom では測れない（幾何は段3送り）。呼び出し自体は通す
  Element.prototype.scrollIntoView = () => {};
  vi.useFakeTimers({ toFake: ["Date"], now: NOW });
  vi.clearAllMocks();

  vi.mocked(addTaskAction).mockResolvedValue(CREATED);
  vi.mocked(createRoutineFromTaskAction).mockResolvedValue(OK);
  vi.mocked(duplicateAndStartTaskAction).mockResolvedValue(CREATED);
  vi.mocked(duplicateTaskAction).mockResolvedValue(CREATED);
  vi.mocked(finishTaskAction).mockResolvedValue(OK);
  vi.mocked(moveTaskByStepAction).mockResolvedValue(OK);
  vi.mocked(postponeTaskAction).mockResolvedValue(OK);
  vi.mocked(renameTaskAction).mockResolvedValue(OK);
  vi.mocked(restoreCompletionAction).mockResolvedValue(OK);
  vi.mocked(restoreTaskAction).mockResolvedValue(OK);
  vi.mocked(setTaskModeAction).mockResolvedValue(OK);
  vi.mocked(setTaskProjectAction).mockResolvedValue(OK);
  vi.mocked(setTaskSectionAction).mockResolvedValue(OK);
  vi.mocked(startTaskAction).mockResolvedValue(OK);
  vi.mocked(suspendTaskAction).mockResolvedValue(OK);
  vi.mocked(undoStartAction).mockResolvedValue(OK);
  vi.mocked(updateTaskEstimateAction).mockResolvedValue(OK);
  vi.mocked(updateTaskPunchAction).mockResolvedValue(OK);
  // 削除・完了の取り消しは Undo（O-8 / O-15）に要る値を返す契約なので、対象から組んで返す
  vi.mocked(deleteTaskAction).mockImplementation(async (id) => ({
    ok: true,
    deleted: defaultTasks().find((t) => t.id === id) ?? makeTask({ id, name: "不明" }),
  }));
  vi.mocked(undoCompleteAction).mockImplementation(async (id) => ({
    ok: true,
    snapshot: { ...SNAPSHOT, taskId: id },
  }));
});

afterEach(async () => {
  const gates = heldGates.splice(0, heldGates.length);
  for (const settleGate of gates) await settleGate();
  // spy（window.confirm）とグローバルスタブ（ResizeObserver）を戻す。偽物が残ると後続が嘘の緑になる。
  // `Element.prototype.scrollIntoView` の直代入だけは戻らない（jsdom に元の実装が無く、無害なため）
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("DailyBoard の楽観的更新（N-01 / 00_共通 §4: 即UIに反映 → 失敗時はトースト＋ロールバック）", () => {
  it("開始打刻はサーバ確定を待たずに実行中として反映する", () => {
    const gate = hold(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    fireEvent.click(within(row(NOT_STARTED)).getByLabelText("開始"));

    // 未解決のまま＝サーバ確定前に実行中（終了できる状態）になっている
    expect(within(row(NOT_STARTED)).queryByLabelText("終了")).not.toBeNull();
  });

  it("開始打刻の失敗はエラートーストを出して未実行へ巻き戻す", async () => {
    const gate = hold(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    fireEvent.click(within(row(NOT_STARTED)).getByLabelText("開始"));
    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
    expect(within(row(NOT_STARTED)).queryByLabelText("開始")).not.toBeNull();
  });

  it("タスク名の変更は確定前に反映し、失敗すると元の名前へ戻す", async () => {
    const gate = hold(OK);
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

  it("エラートーストは × で閉じられる（00_共通 §2.2）", async () => {
    const gate = hold(OK);
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    fireEvent.click(within(row(NOT_STARTED)).getByLabelText("開始"));
    await gate.resolve({ ok: false, message: "保存に失敗しました" });
    fireEvent.click(screen.getByLabelText("閉じる"));

    expect(screen.queryByText("保存に失敗しました")).toBeNull();
  });

  it("見積もりの変更は確定前に反映し、失敗すると元の値へ戻す", async () => {
    const gate = hold(OK);
    vi.mocked(updateTaskEstimateAction).mockReturnValue(gate.promise);
    // 巻き戻り先の 0:30 をテスト本文で決める（既定値に寄りかからない）
    renderBoard([makeTask({ id: 11, name: NOT_STARTED, sectionId: 1, estimateMinutes: 30 })]);
    selectRow(NOT_STARTED);

    press("e");
    commit(screen.getByPlaceholderText("分"), "45");
    expect(within(row(NOT_STARTED)).queryByText("0:45")).not.toBeNull();

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(within(row(NOT_STARTED)).queryByText("0:30")).not.toBeNull();
  });

  it("中断（O-4）は楽観的更新の対象外でサーバ確定まで実行中のまま", () => {
    const gate = hold(OK);
    vi.mocked(suspendTaskAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(RUNNING);

    press("i");

    expect(vi.mocked(suspendTaskAction)).toHaveBeenCalledWith(12, NOW);
    expect(within(row(RUNNING)).queryByLabelText("終了")).not.toBeNull();
  });

  it("複製（O-11）は採番をサーバが決めるため楽観的更新しない", () => {
    const gate = hold(CREATED);
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
    // サーバが採番した複製（同名・未実施のトップ＝実行中タスクの直後）が現れる
    applyServerState([
      ...defaultTasks(),
      makeTask({ id: 31, name: NOT_STARTED, sectionId: 1, sortOrder: 3000 }),
    ]);

    // 同名の行が2つ並ぶので位置で見る（複製元ではなく複製へ移っている）
    expect(isSelected(rowAt(2))).toBe(true);
    expect(isSelected(rowAt(0))).toBe(false);
  });
});

describe("DailyBoard の打刻（F-201 / F-211 / §7: クライアントの現在時刻を送る）", () => {
  it("開始打刻はクライアントの現在時刻を Server Action へ送る（サーバ時刻を使わない）", () => {
    renderBoard();

    fireEvent.click(within(row(NOT_STARTED)).getByLabelText("開始"));

    expect(vi.mocked(startTaskAction)).toHaveBeenCalledWith(11, NOW);
  });

  it("開始打刻の楽観的更新はクライアントの現在時刻をその場に表示する", () => {
    renderBoard();

    fireEvent.click(within(row(NOT_STARTED)).getByLabelText("開始"));

    expect(within(row(NOT_STARTED)).queryByText(formatClock(NOW))).not.toBeNull();
  });

  it("終了打刻もクライアントの現在時刻を送り、実績を即時に表示する", () => {
    renderBoard();

    fireEvent.click(within(row(RUNNING)).getByLabelText("終了"));

    expect(vi.mocked(finishTaskAction)).toHaveBeenCalledWith(12, NOW);
    // 10:00 開始 → 10:30 終了 = 実績 0:30
    expect(within(row(RUNNING)).queryByText("→ 0:30")).not.toBeNull();
  });

  it("終了打刻で完了したら選択行を最初の未実行タスクへ送る（F-211 / §5）", () => {
    renderBoard();
    selectRow(RUNNING);

    fireEvent.click(within(row(RUNNING)).getByLabelText("終了"));

    expect(isSelected(NOT_STARTED)).toBe(true);
    expect(isSelected(RUNNING)).toBe(false);
  });

  it("送り先の未実行タスクがなければ選択は完了行に据え置く（F-211）", () => {
    renderBoard([makeTask({ id: 12, name: RUNNING, sectionId: 1, startedAt: at("10:00") })]);
    selectRow(RUNNING);

    fireEvent.click(within(row(RUNNING)).getByLabelText("終了"));

    expect(isSelected(RUNNING)).toBe(true);
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
      makeTask({ id: 32, name: COMPLETED, sectionId: 2, sortOrder: 2000, startedAt: NOW }),
    ]);

    // 同名の行が2つ並ぶので位置で見る（複製元は完了のまま残る）
    expect(isSelected(rowAt(3))).toBe(true);
    expect(isSelected(rowAt(2))).toBe(false);
  });

  it("完了タスクの打刻ボタンは操作なし（O-14: Enter 限定）", () => {
    renderBoard();

    expect(within(row(COMPLETED)).getByLabelText("完了済み")).toHaveProperty("disabled", true);
  });

  it("割り込み（O-2 / F-201）で既存の実行中タスクを終える処理はサーバの1トランザクションに委ねる", () => {
    renderBoard();

    fireEvent.click(within(row(NOT_STARTED)).getByLabelText("開始"));

    // 画面側で2アクションに分解しない（終了・再開タスク生成は startTaskAction の中で起きる）
    expect(vi.mocked(startTaskAction)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(finishTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(suspendTaskAction)).not.toHaveBeenCalled();
  });
});

describe("DailyBoard の削除と取り消し（O-8 / F-115）", () => {
  it("削除は行を即座に消し、確定後に取り消せる Undo トーストを出す", async () => {
    const deleted = defaultTasks()[0];
    const gate = hold(DELETE_OK);
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

    await clickAndSettle(screen.getByText("取り消す"));

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

    await clickAndSettle(screen.getByText("取り消す"));

    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
  });

  it("削除の失敗は行を戻してエラートーストだけを出す（Undo は出さない）", async () => {
    const gate = hold(DELETE_OK);
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

  it("打刻済みタスクの削除は確認を挟み、キャンセルすると削除しない（O-8）", () => {
    // スタブではなく spy にする（afterEach の restoreAllMocks で本物へ戻り、
    // 後続のテストに「常に false を返す confirm」が residue として残らない）
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    renderBoard();

    chooseRowMenu(COMPLETED, "削除");

    expect(confirm).toHaveBeenCalledWith(`「${COMPLETED}」は打刻済みです。削除しますか？`);
    expect(vi.mocked(deleteTaskAction)).not.toHaveBeenCalled();
    expect(rowNames()).toContain(COMPLETED);
  });
});

describe("DailyBoard の完了の取り消し（O-15 / F-212）", () => {
  it("完了タスクの U は打刻2列を即クリアし、確定後に Undo トーストを出す", async () => {
    const snapshot = {
      taskId: 13,
      startedAt: at("09:00"),
      endedAt: at("09:20"),
      sectionId: 2,
      sortOrder: 1000,
    };
    const gate = hold(UNCOMPLETE_OK);
    vi.mocked(undoCompleteAction).mockReturnValue(gate.promise);
    const { applyServerState } = renderBoard();
    selectRow(COMPLETED);

    press("u");
    // 楽観的更新は打刻2列のクリアだけ（並べ直しはサーバ確定後。O-15）
    expect(vi.mocked(undoCompleteAction)).toHaveBeenCalledWith(13, NOW);
    expect(within(row(COMPLETED)).queryByText(formatClock(at("09:00")))).toBeNull();
    expect(within(row(COMPLETED)).queryByText("→ 0:20")).toBeNull();

    await gate.resolve({ ok: true, snapshot });
    applyServerState([
      ...defaultTasks().filter((t) => t.id !== 13),
      makeTask({ id: 13, name: COMPLETED, sectionId: 1, sortOrder: 1500 }),
    ]);

    expect(within(row(COMPLETED)).queryByText(formatClock(at("09:00")))).toBeNull();
    expect(screen.queryByText(`「${COMPLETED}」を未実行に戻しました`)).not.toBeNull();
  });

  it("Undo トーストの「取り消す」はスナップショットで完了状態へ復帰させる", async () => {
    renderBoard();
    selectRow(COMPLETED);
    await pressAndSettle("u");

    await clickAndSettle(screen.getByText("取り消す"));

    expect(vi.mocked(restoreCompletionAction)).toHaveBeenCalledWith({
      taskId: 13,
      startedAt: at("09:00"),
      endedAt: at("09:20"),
      sectionId: 2,
      sortOrder: 1000,
    });
  });

  it("完了の取り消しが失敗したら打刻を戻してエラートーストを出す", async () => {
    const gate = hold(UNCOMPLETE_OK);
    vi.mocked(undoCompleteAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(COMPLETED);

    press("u");
    expect(within(row(COMPLETED)).queryByText(formatClock(at("09:00")))).toBeNull();
    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(within(row(COMPLETED)).queryByText(formatClock(at("09:00")))).not.toBeNull();
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
    expect(within(row(RUNNING)).queryByLabelText("開始")).not.toBeNull();
  });

  it("保留がなく未実行タスクを選択中の U は何もしない", () => {
    renderBoard();
    selectRow(NOT_STARTED);

    press("u");

    expect(vi.mocked(undoStartAction)).not.toHaveBeenCalled();
    expect(vi.mocked(undoCompleteAction)).not.toHaveBeenCalled();
    expect(vi.mocked(restoreTaskAction)).not.toHaveBeenCalled();
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

describe("DailyBoard のクイック追加（§3.4 / F-102）", () => {
  it("Enter で楽観的に行を出し、欄をクリアする", () => {
    const gate = hold(CREATED);
    vi.mocked(addTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    const input = quickAddInput();
    fireEvent.change(input, { target: { value: "  買い物  " } });
    fireEvent.keyDown(input, { key: "Enter" });

    expect(vi.mocked(addTaskAction)).toHaveBeenCalledWith({ date: DATE, name: "買い物" });
    // 未分類（リスト先頭）の末尾に確定前から出る
    expect(rowNames()).toEqual(["買い物", NOT_STARTED, RUNNING, COMPLETED]);
    expect(input).toHaveProperty("value", "");
  });

  it("空のままの Enter は何もしない（§8）", () => {
    renderBoard();

    fireEvent.change(quickAddInput(), { target: { value: "   " } });
    fireEvent.keyDown(quickAddInput(), { key: "Enter" });

    expect(vi.mocked(addTaskAction)).not.toHaveBeenCalled();
    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
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
    applyServerState([...defaultTasks(), makeTask({ id: 21, name: "買い物" })]);

    expect(isSelected("買い物")).toBe(true);
  });

  it("追加の失敗は仮の行を取り消してエラートーストを出す", async () => {
    const gate = hold(CREATED);
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
    renderBoard([makeTask({ id: 11, name: NOT_STARTED, sectionId: 1, estimateMinutes: 30 })]);
    selectRow(NOT_STARTED);

    press("r");
    commit(screen.getByDisplayValue(NOT_STARTED), NOT_STARTED);
    press("e");
    commit(screen.getByPlaceholderText("分"), "30"); // 同じ値の再確定

    expect(vi.mocked(renameTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(updateTaskEstimateAction)).not.toHaveBeenCalled();
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

  // 引数の検証は `toHaveBeenCalledWith` を基準にし、**引数から導出した値を調べるときだけ**
  // `mock.calls[0]` を使う（打刻の修正は入力の HH:MM がローカル時刻で解釈された結果を見るため）
  it("終了時刻の修正は開始時刻を保ったまま送る（F-203）", () => {
    renderBoard();
    selectRow(COMPLETED);

    press("f");
    commit(punchInput(), "0930");

    const call = vi.mocked(updateTaskPunchAction).mock.calls[0];
    expect(call[0]).toBe(13);
    expect(call[1].startedAt).toEqual(at("09:00"));
    expect(call[1].endedAt?.getHours()).toBe(9);
    expect(call[1].endedAt?.getMinutes()).toBe(30);
    // 移動先セクションの判定は開始時刻の HH:MM で行う（§4.2-c）
    expect(call[2]).toBe(formatClock(at("09:00")));
  });

  it("開始時刻の修正はセクション判定用の HH:MM とクライアントの現在時刻を添えて送る（§4.2-c）", () => {
    renderBoard();
    selectRow(RUNNING);

    press("b");
    commit(punchInput(), "0915");

    const call = vi.mocked(updateTaskPunchAction).mock.calls[0];
    expect(call[0]).toBe(12);
    // HH:MM は利用者のタイムゾーンで解釈する（実行環境のローカル時刻で組み立てられる）
    expect(call[1].startedAt.getHours()).toBe(9);
    expect(call[1].startedAt.getMinutes()).toBe(15);
    expect(call[1].endedAt).toBeNull();
    expect(call[3]).toEqual(NOW);
  });
});

describe("DailyBoard のショートカット結線（§6。キー判定そのものは use-daily-shortcuts が持つ）", () => {
  it("Shift+J は選択タスクを1つ下へ動かし、楽観的に並べ替える", () => {
    const gate = hold(OK);
    vi.mocked(moveTaskByStepAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("J", { shiftKey: true });

    expect(vi.mocked(moveTaskByStepAction)).toHaveBeenCalledWith({
      taskId: 11,
      date: DATE,
      step: 1,
    });
    expect(rowNames()).toEqual([RUNNING, NOT_STARTED, COMPLETED]);
    // 移動したタスクを選択したまま追従させる（§5 / FB-50）
    expect(isSelected(NOT_STARTED)).toBe(true);
  });

  it("並び替えが失敗したら並びを戻し、選択は移動対象に残す（N-01 / §5）", async () => {
    const gate = hold(OK);
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
    const gate = hold(OK);
    vi.mocked(moveTaskByStepAction).mockReturnValue(gate.promise);
    // 初期選択は「現在地」＝先頭の未実行タスク。固定しないと移動後に選択が再導出されて別タスクへ飛ぶ
    renderBoard([
      makeTask({ id: 21, name: "洗濯", sectionId: 1, sortOrder: 1000 }),
      makeTask({ id: 22, name: "掃除", sectionId: 1, sortOrder: 2000 }),
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
    renderBoard([makeTask({ id: 21, name: "洗濯" }), ...defaultTasks()]);
    selectRow("洗濯");

    press("K", { shiftKey: true });

    expect(vi.mocked(moveTaskByStepAction)).not.toHaveBeenCalled();
    expect(rowNames()).toEqual(["洗濯", NOT_STARTED, RUNNING, COMPLETED]);
  });

  it("Shift+J はセクションを跨いで移動する（O-6。並びが同じでも所属が変わる）", () => {
    const gate = hold(OK);
    vi.mocked(moveTaskByStepAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(RUNNING); // 午前グループの最終行

    press("J", { shiftKey: true });

    // 表示順は隣接したままだが、行のセクション表記が移動先（午後）に変わる
    expect(within(row(RUNNING)).queryByRole("button", { name: "午後" })).not.toBeNull();
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
    const gate = hold(OK);
    vi.mocked(moveTaskByStepAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(RUNNING);

    press("K", { shiftKey: true });

    expect(vi.mocked(moveTaskByStepAction)).toHaveBeenCalledWith({
      taskId: 12,
      date: DATE,
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

  it("C は現在地（実行中タスク）へ選択を戻す（§5）", () => {
    renderBoard();
    selectRow(COMPLETED);

    press("c");

    expect(isSelected(RUNNING)).toBe(true);
  });

  it("R はタスク名のインライン編集を開く", () => {
    renderBoard();
    selectRow(NOT_STARTED);

    press("r");

    expect(screen.queryByDisplayValue(NOT_STARTED)).not.toBeNull();
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
    renderBoard(defaultTasks(), { date: "2026-07-20", today: DATE, isToday: false });

    press("H", { shiftKey: true });
    press("L", { shiftKey: true });

    expect(push).toHaveBeenCalledWith("/?date=2026-07-19");
    expect(push).toHaveBeenCalledWith("/?date=2026-07-21");
    expect(push).toHaveBeenCalledTimes(2);
  });

  it("今日以外を表示中は「今日へ」を出す（isToday の配線。§3.1）", () => {
    renderBoard(defaultTasks(), { date: "2026-07-20", today: DATE, isToday: false });

    expect(screen.queryByRole("link", { name: "今日へ" })).not.toBeNull();
  });

  it("今日を表示中は「今日へ」を出さない（isToday の配線。§3.1）", () => {
    renderBoard();

    expect(screen.queryByRole("link", { name: "今日へ" })).toBeNull();
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

    fireEvent.click(screen.getByLabelText("キーボードショートカット"));
    expect(screen.queryByRole("heading", { name: "キーボードショートカット" })).not.toBeNull();

    fireEvent.click(screen.getByText("閉じる（Esc）"));
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

describe("DailyBoard の割り当て（O-5: モード・プロジェクト・セクション）", () => {
  it("モードの割り当ては楽観的に反映し、失敗すると未設定へ戻す", async () => {
    const gate = hold(OK);
    vi.mocked(setTaskModeAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("m");
    chooseOption("集中");

    expect(vi.mocked(setTaskModeAction)).toHaveBeenCalledWith(11, 1);
    expect(within(row(NOT_STARTED)).queryByLabelText("モード（集中）")).not.toBeNull();

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(within(row(NOT_STARTED)).queryByLabelText("モード（未設定）")).not.toBeNull();
  });

  it("プロジェクトの割り当てもモードと同じ規則で楽観的に反映する（O-5 / F-402）", () => {
    const gate = hold(OK);
    vi.mocked(setTaskProjectAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("p");
    chooseOption("改善");

    expect(vi.mocked(setTaskProjectAction)).toHaveBeenCalledWith(11, 1);
    expect(within(row(NOT_STARTED)).queryByLabelText("プロジェクト（改善）")).not.toBeNull();
  });

  it("セクションの割り当ては移動先の末尾へ楽観的に動かし、失敗すると元の位置へ戻す（O-5 / §4.3）", async () => {
    const gate = hold(OK);
    vi.mocked(setTaskSectionAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("s");
    chooseOption("午後");

    expect(vi.mocked(setTaskSectionAction)).toHaveBeenCalledWith({
      taskId: 11,
      date: DATE,
      sectionId: 2,
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
      date: DATE,
      sectionId: 2,
    });
    expect(vi.mocked(startTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(finishTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(duplicateAndStartTaskAction)).not.toHaveBeenCalled();
  });
});

describe("DailyBoard の通知と行メニュー（画面定義書01 §8 / O-7 / O-12）", () => {
  it("ルーチン化（O-12）はサーバ確定を待って完了通知を出す", async () => {
    renderBoard();

    chooseRowMenu(NOT_STARTED, "ルーチン化");
    await clickAndSettle(screen.getByRole("button", { name: "作成" }));

    expect(vi.mocked(createRoutineFromTaskAction)).toHaveBeenCalledWith(
      11,
      expect.objectContaining({ scheduledStartTime: "09:00" })
    );
    expect(
      screen.queryByText(`「${NOT_STARTED}」をルーチン化しました（明日から展開）`)
    ).not.toBeNull();
  });

  it("前日以前の実行中タスクがあれば警告バナーを出す（F-209）", () => {
    renderBoard(defaultTasks(), {
      staleRunningTask: makeTask({
        id: 5,
        name: "読書",
        taskDate: "2026-07-25",
        startedAt: new Date(YEAR, MONTH - 1, DAY - 1, 23, 0),
      }),
    });

    expect(screen.queryByText("読書")).not.toBeNull();
    expect(screen.queryByRole("link", { name: "該当日を開く" })).not.toBeNull();
  });

  it("ルーチン化が失敗したらエラートーストを出す（§4.1）", async () => {
    vi.mocked(createRoutineFromTaskAction).mockResolvedValue({
      ok: false,
      message: "見積もりを入力してからルーチン化してください",
    });
    renderBoard();

    chooseRowMenu(NOT_STARTED, "ルーチン化");
    await clickAndSettle(screen.getByRole("button", { name: "作成" }));

    expect(screen.queryByText("見積もりを入力してからルーチン化してください")).not.toBeNull();
    expect(screen.queryByText(/ルーチン化しました/)).toBeNull();
  });

  it("完了通知トーストは × で閉じられる（00_共通 §2.2）", async () => {
    renderBoard();

    chooseRowMenu(NOT_STARTED, "ルーチン化");
    await clickAndSettle(screen.getByRole("button", { name: "作成" }));
    fireEvent.click(screen.getByLabelText("閉じる"));

    expect(screen.queryByText(/ルーチン化しました/)).toBeNull();
  });

  it("Undo トーストを × で閉じると保留も破棄され、U は選択行の状態で切り分けに戻る（O-13）", async () => {
    const { applyServerState } = renderBoard();
    selectRow(NOT_STARTED);
    await pressAndSettle("d");
    applyServerState(defaultTasks().filter((t) => t.id !== 11)); // 選択は現在地（実行中）へ移る

    fireEvent.click(screen.getByLabelText("閉じる"));
    press("u"); // 保留が無くなったので選択行（削除後は現在地＝実行中タスク）の切り分けへ

    expect(vi.mocked(restoreTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(undoStartAction)).toHaveBeenCalledTimes(1);
  });

  it("放置がなければバナーは出さない", () => {
    renderBoard();

    expect(screen.queryByRole("link", { name: "該当日を開く" })).toBeNull();
  });

  it("先送りが失敗したらエラートーストを出す（O-7）", async () => {
    vi.mocked(postponeTaskAction).mockResolvedValue({
      ok: false,
      message: "先送りできるのは未実行タスクだけです",
    });
    renderBoard();

    chooseRowMenu(NOT_STARTED, "翌日へ先送り");
    await settleActions();

    expect(screen.queryByText("先送りできるのは未実行タスクだけです")).not.toBeNull();
  });

  it("先送り（O-7）は行メニューから実行し、楽観的更新はしない", () => {
    const gate = hold(OK);
    vi.mocked(postponeTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    chooseRowMenu(NOT_STARTED, "翌日へ先送り");

    expect(vi.mocked(postponeTaskAction)).toHaveBeenCalledWith(11);
    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
  });
});
