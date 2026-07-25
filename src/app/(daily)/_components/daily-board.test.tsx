import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { Section } from "@/domain/section/section";
import { groupTasksBySection } from "@/domain/task/daily-list";
import type { Task } from "@/domain/task/task";
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
/** 打刻はクライアントの現在時刻を送る（§7）ので、時計を固定して観測できるようにする */
const NOW = new Date("2026-07-26T10:30:00+09:00");

/** 表示日の壁時計（日本時間）から Date を作る。`formatClock` は常に日本時間で整形する */
function at(hhmm: string): Date {
  return new Date(`${DATE}T${hhmm}:00+09:00`);
}

function makeTask(over: Partial<Task> & { id: number; name: string }): Task {
  return {
    taskDate: DATE,
    estimateMinutes: 30,
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

/**
 * Server Action を保留させ、解決の瞬間をテストが握る（楽観的更新の「確定前」を観測するため）。
 * React は未完了の非同期アクションを束ねて扱うので、**解決し忘れた保留は後続テストの巻き戻しまで
 * 止めてしまう**（嘘の赤になる）。取りこぼしても壊れないよう afterEach が既定値で解決する
 */
const heldGates: (() => Promise<void>)[] = [];

function hold<T>(fallback: T) {
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
    if (!done) await resolve(fallback);
  });
  return { promise, resolve };
}

function row(name: string): HTMLElement {
  const tr = screen.getByRole("button", { name }).closest("tr");
  if (tr === null) throw new Error(`行が見つかりません: ${name}`);
  return tr;
}

/** 表示順のタスク名（列見出し・セクション見出し行は除く）。並び替え・追加・削除の検証に使う */
function rowNames(): string[] {
  return screen.getAllByRole("row").flatMap((tr) => {
    const cells = tr.querySelectorAll("td");
    if (cells.length < 2) return []; // セクション見出し行（colSpan の1セル）
    const nameButton = cells[1].querySelector("button");
    return nameButton === null ? [] : [nameButton.textContent ?? ""];
  });
}

/** 選択行の強調（§5）。行の地色で示す */
function isSelected(name: string): boolean {
  return row(name).classList.contains("bg-accent-weak");
}

/** クリックでの行選択（§5: マウス操作とキーボード操作は等価） */
function selectRow(name: string) {
  fireEvent.click(row(name));
}

/** グローバルショートカット（§6）。フックが window で購読しているので body へ送る */
function press(key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(document.body, { key, ...init });
}

function quickAddInput(): HTMLElement {
  return screen.getByPlaceholderText("タスク名を入力して Enter で追加");
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

  const ok: DailyActionResult = { ok: true };
  const created: CreatingActionResult = { ok: true, createdId: 99 };
  vi.mocked(addTaskAction).mockResolvedValue(created);
  vi.mocked(createRoutineFromTaskAction).mockResolvedValue(ok);
  vi.mocked(duplicateAndStartTaskAction).mockResolvedValue(created);
  vi.mocked(duplicateTaskAction).mockResolvedValue(created);
  vi.mocked(finishTaskAction).mockResolvedValue(ok);
  vi.mocked(moveTaskByStepAction).mockResolvedValue(ok);
  vi.mocked(postponeTaskAction).mockResolvedValue(ok);
  vi.mocked(renameTaskAction).mockResolvedValue(ok);
  vi.mocked(restoreCompletionAction).mockResolvedValue(ok);
  vi.mocked(restoreTaskAction).mockResolvedValue(ok);
  vi.mocked(setTaskModeAction).mockResolvedValue(ok);
  vi.mocked(setTaskProjectAction).mockResolvedValue(ok);
  vi.mocked(setTaskSectionAction).mockResolvedValue(ok);
  vi.mocked(startTaskAction).mockResolvedValue(ok);
  vi.mocked(suspendTaskAction).mockResolvedValue(ok);
  vi.mocked(undoStartAction).mockResolvedValue(ok);
  vi.mocked(updateTaskEstimateAction).mockResolvedValue(ok);
  vi.mocked(updateTaskPunchAction).mockResolvedValue(ok);
  // 削除・完了の取り消しは Undo（O-8 / O-15）に要る値を返す契約なので、対象から組んで返す
  vi.mocked(deleteTaskAction).mockImplementation(async (id) => ({
    ok: true,
    deleted: defaultTasks().find((t) => t.id === id) ?? makeTask({ id, name: "不明" }),
  }));
  vi.mocked(undoCompleteAction).mockImplementation(async (id) => ({
    ok: true,
    snapshot: {
      taskId: id,
      startedAt: at("09:00"),
      endedAt: at("09:20"),
      sectionId: 2,
      sortOrder: 1000,
    },
  }));
});

afterEach(async () => {
  const gates = heldGates.splice(0, heldGates.length);
  for (const settleGate of gates) await settleGate();
});

describe("DailyBoard の楽観的更新（N-01 / 00_共通 §4: 即UIに反映 → 失敗時はトースト＋ロールバック）", () => {
  it("開始打刻はサーバ確定を待たずに実行中として反映する", () => {
    const gate = hold<DailyActionResult>({ ok: true });
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    fireEvent.click(within(row(NOT_STARTED)).getByLabelText("開始"));

    // 未解決のまま＝サーバ確定前に実行中（終了できる状態）になっている
    expect(within(row(NOT_STARTED)).queryByLabelText("終了")).not.toBeNull();
  });

  it("開始打刻の失敗はエラートーストを出して未実行へ巻き戻す", async () => {
    const gate = hold<DailyActionResult>({ ok: true });
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    fireEvent.click(within(row(NOT_STARTED)).getByLabelText("開始"));
    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
    expect(within(row(NOT_STARTED)).queryByLabelText("開始")).not.toBeNull();
  });

  it("タスク名の変更は確定前に反映し、失敗すると元の名前へ戻す", async () => {
    const gate = hold<DailyActionResult>({ ok: true });
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
    const gate = hold<DailyActionResult>({ ok: true });
    vi.mocked(startTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    fireEvent.click(within(row(NOT_STARTED)).getByLabelText("開始"));
    await gate.resolve({ ok: false, message: "保存に失敗しました" });
    fireEvent.click(screen.getByLabelText("閉じる"));

    expect(screen.queryByText("保存に失敗しました")).toBeNull();
  });

  it("見積もりの変更は確定前に反映し、失敗すると元の値へ戻す", async () => {
    const gate = hold<DailyActionResult>({ ok: true });
    vi.mocked(updateTaskEstimateAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("e");
    commit(screen.getByPlaceholderText("分"), "45");
    expect(within(row(NOT_STARTED)).queryByText("0:45")).not.toBeNull();

    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(within(row(NOT_STARTED)).queryByText("0:30")).not.toBeNull();
  });

  it("中断（O-4）は楽観的更新の対象外でサーバ確定まで実行中のまま", () => {
    const gate = hold<DailyActionResult>({ ok: true });
    vi.mocked(suspendTaskAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(RUNNING);

    press("i");

    expect(vi.mocked(suspendTaskAction).mock.calls[0]).toEqual([12, NOW]);
    expect(within(row(RUNNING)).queryByLabelText("終了")).not.toBeNull();
  });

  it("複製（O-11）は採番をサーバが決めるため楽観的更新しない", () => {
    const gate = hold<CreatingActionResult>({ ok: true, createdId: 99 });
    vi.mocked(duplicateTaskAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("y");

    expect(vi.mocked(duplicateTaskAction)).toHaveBeenCalledWith(11);
    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
  });
});

describe("DailyBoard の打刻（F-201 / F-211 / §7: クライアントの現在時刻を送る）", () => {
  it("開始打刻はクライアントの現在時刻を Server Action へ送る（サーバ時刻を使わない）", () => {
    renderBoard();

    fireEvent.click(within(row(NOT_STARTED)).getByLabelText("開始"));

    expect(vi.mocked(startTaskAction).mock.calls[0]).toEqual([11, NOW]);
  });

  it("開始打刻の楽観的更新はクライアントの現在時刻をその場に表示する", () => {
    renderBoard();

    fireEvent.click(within(row(NOT_STARTED)).getByLabelText("開始"));

    expect(within(row(NOT_STARTED)).queryByText("10:30")).not.toBeNull();
  });

  it("終了打刻もクライアントの現在時刻を送り、実績を即時に表示する", () => {
    renderBoard();

    fireEvent.click(within(row(RUNNING)).getByLabelText("終了"));

    expect(vi.mocked(finishTaskAction).mock.calls[0]).toEqual([12, NOW]);
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

    expect(vi.mocked(duplicateAndStartTaskAction).mock.calls[0]).toEqual([13, NOW]);
    expect(vi.mocked(startTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(finishTaskAction)).not.toHaveBeenCalled();
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
    const gate = hold<Awaited<ReturnType<typeof deleteTaskAction>>>({ ok: true, deleted });
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
    await act(async () => {
      press("d");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("取り消す"));
    });

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
    await act(async () => {
      press("d");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("取り消す"));
    });

    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
  });

  it("削除の失敗は行を戻してエラートーストだけを出す（Undo は出さない）", async () => {
    const gate = hold<Awaited<ReturnType<typeof deleteTaskAction>>>({
      ok: false,
      message: "保存に失敗しました",
    });
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
    const confirm = vi.fn().mockReturnValue(false);
    vi.stubGlobal("confirm", confirm);
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
    const gate = hold<Awaited<ReturnType<typeof undoCompleteAction>>>({ ok: true, snapshot });
    vi.mocked(undoCompleteAction).mockReturnValue(gate.promise);
    const { applyServerState } = renderBoard();
    selectRow(COMPLETED);

    press("u");
    // 楽観的更新は打刻2列のクリアだけ（並べ直しはサーバ確定後。O-15）
    expect(vi.mocked(undoCompleteAction).mock.calls[0]).toEqual([13, NOW]);
    expect(within(row(COMPLETED)).queryByText("09:00")).toBeNull();
    expect(within(row(COMPLETED)).queryByText("→ 0:20")).toBeNull();

    await gate.resolve({ ok: true, snapshot });
    applyServerState([
      ...defaultTasks().filter((t) => t.id !== 13),
      makeTask({ id: 13, name: COMPLETED, sectionId: 1, sortOrder: 1500 }),
    ]);

    expect(within(row(COMPLETED)).queryByText("09:00")).toBeNull();
    expect(screen.queryByText(`「${COMPLETED}」を未実行に戻しました`)).not.toBeNull();
  });

  it("Undo トーストの「取り消す」はスナップショットで完了状態へ復帰させる", async () => {
    renderBoard();
    selectRow(COMPLETED);
    await act(async () => {
      press("u");
    });

    await act(async () => {
      fireEvent.click(screen.getByText("取り消す"));
    });

    expect(vi.mocked(restoreCompletionAction)).toHaveBeenCalledWith({
      taskId: 13,
      startedAt: at("09:00"),
      endedAt: at("09:20"),
      sectionId: 2,
      sortOrder: 1000,
    });
  });

  it("完了の取り消しが失敗したら打刻を戻してエラートーストを出す", async () => {
    const gate = hold<Awaited<ReturnType<typeof undoCompleteAction>>>({
      ok: false,
      message: "保存に失敗しました",
    });
    vi.mocked(undoCompleteAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(COMPLETED);

    press("u");
    expect(within(row(COMPLETED)).queryByText("09:00")).toBeNull();
    await gate.resolve({ ok: false, message: "保存に失敗しました" });

    expect(within(row(COMPLETED)).queryByText("09:00")).not.toBeNull();
    expect(screen.queryByText("保存に失敗しました")).not.toBeNull();
    expect(screen.queryByText("取り消す")).toBeNull();
  });
});

describe("DailyBoard の U の切り分け（O-13: 保留 → 実行中 → 完了 → 何もしない）", () => {
  it("取り消しの保留があるあいだの U は保留の解決を最優先する（開始取消に化けない）", async () => {
    renderBoard();
    selectRow(NOT_STARTED);
    await act(async () => {
      press("d"); // 削除で選択は現在地（実行中タスク）へ移る
    });

    await act(async () => {
      press("u");
    });

    expect(vi.mocked(restoreTaskAction)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(undoStartAction)).not.toHaveBeenCalled();
  });

  it("保留がなく実行中タスクを選択中の U は開始打刻を取り消す（F-210）", () => {
    renderBoard();
    selectRow(RUNNING);

    press("u");

    expect(vi.mocked(undoStartAction).mock.calls[0]).toEqual([12, NOW]);
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
    await act(async () => {
      press("u"); // 完了の取り消し → 保留は「未実行に戻しました」
    });
    selectRow(NOT_STARTED);

    await act(async () => {
      press("d"); // 削除 → 保留は「削除しました」へ置き換わる
    });

    expect(screen.queryByText(`「${COMPLETED}」を未実行に戻しました`)).toBeNull();
    expect(screen.queryByText(`「${NOT_STARTED}」を削除しました`)).not.toBeNull();
    expect(screen.getAllByText("取り消す")).toHaveLength(1);
  });
});

describe("DailyBoard のクイック追加（§3.4 / F-102）", () => {
  it("Enter で楽観的に行を出し、欄をクリアする", () => {
    const gate = hold<CreatingActionResult>({ ok: true, createdId: 99 });
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
    const gate = hold<CreatingActionResult>({ ok: true, createdId: 99 });
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
    renderBoard();
    selectRow(NOT_STARTED);

    press("r");
    commit(screen.getByDisplayValue(NOT_STARTED), NOT_STARTED);
    press("e");
    commit(screen.getByPlaceholderText("分"), "30");

    expect(vi.mocked(renameTaskAction)).not.toHaveBeenCalled();
    expect(vi.mocked(updateTaskEstimateAction)).not.toHaveBeenCalled();
  });

  it("打刻の修正（F-203）は不正な時刻を送信せずエラートーストを出す", () => {
    renderBoard();
    selectRow(RUNNING);

    press("b");
    commit(screen.getByDisplayValue("10:00"), "25:99");

    expect(vi.mocked(updateTaskPunchAction)).not.toHaveBeenCalled();
    expect(screen.queryByText("時刻は HH:MM 形式で入力してください")).not.toBeNull();
  });

  it("終了時刻を開始より前へ直すと確定不可（§8: 開始 ≦ 終了）", () => {
    renderBoard();
    selectRow(COMPLETED);

    press("f");
    commit(screen.getByDisplayValue("09:20"), "0800");

    expect(vi.mocked(updateTaskPunchAction)).not.toHaveBeenCalled();
    expect(screen.queryByText("終了時刻は開始時刻より後にしてください")).not.toBeNull();
  });

  it("終了時刻の修正は開始時刻を保ったまま送る（F-203）", () => {
    renderBoard();
    selectRow(COMPLETED);

    press("f");
    commit(screen.getByDisplayValue("09:20"), "0930");

    const call = vi.mocked(updateTaskPunchAction).mock.calls[0];
    expect(call[0]).toBe(13);
    expect(call[1].startedAt).toEqual(at("09:00"));
    expect(call[1].endedAt?.getHours()).toBe(9);
    expect(call[1].endedAt?.getMinutes()).toBe(30);
    // 移動先セクションの判定は開始時刻の HH:MM で行う（§4.2-c）
    expect(call[2]).toBe("09:00");
  });

  it("開始時刻の修正はセクション判定用の HH:MM とクライアントの現在時刻を添えて送る（§4.2-c）", () => {
    renderBoard();
    selectRow(RUNNING);

    press("b");
    commit(screen.getByDisplayValue("10:00"), "0915");

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
    const gate = hold<DailyActionResult>({ ok: true });
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

  it("一度も明示選択していない状態の並び替えも対象を選択として固定する（§5 / FB-50）", () => {
    const gate = hold<DailyActionResult>({ ok: true });
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

  it("リスト全体の端では並び替えない（O-6）", () => {
    renderBoard();
    selectRow(COMPLETED); // 表示順の最後尾

    press("J", { shiftKey: true });

    expect(vi.mocked(moveTaskByStepAction)).not.toHaveBeenCalled();
    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
  });

  it("Shift+K は逆方向へ動かす", () => {
    const gate = hold<DailyActionResult>({ ok: true });
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

  it("T / Shift+H / Shift+L は日付移動（§6 / O-9）", () => {
    renderBoard();

    press("t");
    press("H", { shiftKey: true });
    press("L", { shiftKey: true });

    expect(push.mock.calls).toEqual([["/"], ["/?date=2026-07-25"], ["/?date=2026-07-27"]]);
  });

  it("? はショートカット一覧を開閉する", () => {
    renderBoard();

    press("?");
    expect(screen.queryByRole("heading", { name: "キーボードショートカット" })).not.toBeNull();

    press("?");
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
    const gate = hold<DailyActionResult>({ ok: true });
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
    const gate = hold<DailyActionResult>({ ok: true });
    vi.mocked(setTaskProjectAction).mockReturnValue(gate.promise);
    renderBoard();
    selectRow(NOT_STARTED);

    press("p");
    chooseOption("改善");

    expect(vi.mocked(setTaskProjectAction)).toHaveBeenCalledWith(11, 1);
    expect(within(row(NOT_STARTED)).queryByLabelText("プロジェクト（改善）")).not.toBeNull();
  });

  it("セクションの割り当ては移動先の末尾へ楽観的に動かす（O-5 / §4.3）", () => {
    const gate = hold<DailyActionResult>({ ok: true });
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
  });
});

describe("DailyBoard の通知と行メニュー（画面定義書01 §8 / O-7 / O-12）", () => {
  it("ルーチン化（O-12）はサーバ確定を待って完了通知を出す", async () => {
    renderBoard();

    chooseRowMenu(NOT_STARTED, "ルーチン化");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "作成" }));
    });

    expect(vi.mocked(createRoutineFromTaskAction).mock.calls[0]?.[0]).toBe(11);
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
        startedAt: new Date("2026-07-25T23:00:00+09:00"),
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
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "作成" }));
    });

    expect(screen.queryByText("見積もりを入力してからルーチン化してください")).not.toBeNull();
    expect(screen.queryByText(/ルーチン化しました/)).toBeNull();
  });

  it("完了通知トーストは × で閉じられる（00_共通 §2.2）", async () => {
    renderBoard();

    chooseRowMenu(NOT_STARTED, "ルーチン化");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "作成" }));
    });
    fireEvent.click(screen.getByLabelText("閉じる"));

    expect(screen.queryByText(/ルーチン化しました/)).toBeNull();
  });

  it("Undo トーストを × で閉じると保留も破棄され、U は選択行の状態で切り分けに戻る（O-13）", async () => {
    const { applyServerState } = renderBoard();
    selectRow(NOT_STARTED);
    await act(async () => {
      press("d");
    });
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
    await act(async () => {}); // サーバ確定後の再描画まで流す

    expect(screen.queryByText("先送りできるのは未実行タスクだけです")).not.toBeNull();
  });

  it("先送り（O-7）は行メニューから実行し、楽観的更新はしない", () => {
    const gate = hold<DailyActionResult>({ ok: true });
    vi.mocked(postponeTaskAction).mockReturnValue(gate.promise);
    renderBoard();

    chooseRowMenu(NOT_STARTED, "翌日へ先送り");

    expect(vi.mocked(postponeTaskAction)).toHaveBeenCalledWith(11);
    expect(rowNames()).toEqual([NOT_STARTED, RUNNING, COMPLETED]);
  });
});
