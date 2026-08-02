// `DailyBoard` のテスト（`daily-board.*.test.tsx`）が共有する土台。**既定は複数のファイルが
// 使うものだけ**を置く（1ファイルしか使わないヘルパはそのファイルへ）。例外は2つ——
// `setupBoard` が要るもの（`ResizeObserverStub`）と、組で意味を持つ定数（アクションの成功値）。
//
// 置き場の切り分け（テスト戦略定義書 §4）: 表の DOM 読み取り（行・セル・見出し）は
// `table-helpers.ts`、グループとマスタのフィクスチャは `factories.ts`、画面をまたぐ操作は
// `@/app/_testing/interactions`。**ここが持つのは盤面に閉じたもの**——jsdom の詰め物、
// 盤面のフィクスチャ（タスク・時刻・アクションの成功値）、描画、前後処理、操作、保留。
import { act, fireEvent, render, screen } from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, vi } from "vitest";

import { clickWithoutServer } from "@/app/_testing/interactions";
import { atJst, TEST_DATE } from "@/domain/shared/testing/clock";
import { groupTasksBySection } from "@/domain/task/daily-list";
import type { Task } from "@/domain/task/task";
import { task } from "@/domain/task/testing/task";
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
  setTaskHighlightAction,
  setTaskModeAction,
  setTaskProjectAction,
  setTaskSectionAction,
  startTaskAction,
  suspendTaskAction,
  undoCompleteAction,
  undoStartAction,
  updateTaskCommentAction,
  updateTaskEstimateAction,
  updateTaskPunchAction,
  type CreatingActionResult,
  type DailyActionResult,
} from "../actions";
import { DailyBoard } from "../_components/daily-board";
import { MODES, PROJECTS, SECTIONS, sectionOf } from "./factories";
import { taskRow } from "./table-helpers";

/** jsdom に無い API を局所的に補う（幾何の判定そのものは段3＝ブラウザテスト送り） */
export class ResizeObserverStub {
  /**
   * 直近に生成されたインスタンス（`beforeEach` で毎回 null に戻す）。テストから寸法の変化を
   * 起こすために持つ。**画面で ResizeObserver を使うのは固定領域の計測1か所だけ**なので
   * 「直近の1つ」で足りる——2つ目の利用者が入ったら掴む相手を選べるようにする必要がある
   */
  static latest: ResizeObserverStub | null = null;

  private readonly callback: ResizeObserverCallback;
  private target: Element | null = null;

  constructor(callback: ResizeObserverCallback) {
    this.callback = callback;
    ResizeObserverStub.latest = this;
  }

  observe(target: Element): void {
    this.target = target;
  }
  unobserve(): void {}
  disconnect(): void {}

  /**
   * 観測対象に高さを与えてコールバックを1回発火する。**jsdom はレイアウトを計算せず
   * `offsetHeight` が常に 0** なので値は差し込む——ここで見るのは実測の正しさ（段3送り）ではなく、
   * 測った値が行まで配線されているか。**実装は要素から測る**ので entry は空で渡す
   * （`entry.contentRect` から読む形へ変えるなら、ここも渡すように直す必要がある）
   */
  resizeTo(height: number): void {
    if (this.target === null) throw new Error("observe されていません");
    Object.defineProperty(this.target, "offsetHeight", { value: height, configurable: true });
    this.callback([], this);
  }
}

// 打刻の修正（F-203 / `applyClockTime`）も表示（`formatClock`）も `APP_TIME_ZONE` 固定の
// 壁時計で扱うので、テストデータは `atJst` で組む（T-47）。それでも**画面に出る時刻の期待値は
// リテラルで書かず `formatClock(atJst(...))` で組み立てる**（整形の書式を二重に書かないため）

/** 打刻はクライアントの現在時刻を送る（§7）ので、時計を固定して観測できるようにする */
export const NOW = atJst("10:30");

// マスタは `factories` の共有フィクスチャを使う（時間帯の定義はそちらが正）。
// **NOW = 10:30 が属するのは 午前**なので、現在セクションを要するテストは FORENOON に、
// 「現在セクションより後ろ」を要するテストは AFTERNOON に置く。
// ID ではなく実体で持つのは、同じテストの中で「名前で選び ID で送られたかを見る」ため
export const FORENOON = sectionOf("午前");
export const AFTERNOON = sectionOf("午後");

export const NOT_STARTED = "資料作成";
export const RUNNING = "定例会議";
export const COMPLETED = "レビュー";
/** 未分類（インボックス）の未実行タスク。表示順ではリストの先頭に来る（§3.2） */
export const INBOX = "未分類のメモ";

/** 未実行・実行中・完了が1件ずつある1日（表示順は 午前[未実行, 実行中] → 午後[完了]） */
export function defaultTasks(): Task[] {
  return [
    task({ id: 11, name: NOT_STARTED, sectionId: FORENOON.id, sortOrder: 1000 }),
    task({
      id: 12,
      name: RUNNING,
      sectionId: FORENOON.id,
      sortOrder: 2000,
      startedAt: atJst("10:00"),
    }),
    task({
      id: 13,
      name: COMPLETED,
      sectionId: AFTERNOON.id,
      sortOrder: 1000,
      startedAt: atJst("09:00"),
      endedAt: atJst("09:20"),
    }),
  ];
}

/** 完了の取り消し（O-15）が返す復帰用スナップショット（データモデル定義書 §4.7 の4列） */
const SNAPSHOT: CompletionSnapshot = {
  taskId: 13,
  startedAt: atJst("09:00"),
  endedAt: atJst("09:20"),
  sectionId: AFTERNOON.id,
  sortOrder: 1000,
};

// 返り値が ActionResult でないアクションの型（`hold` と mock の記述を1行に収める）
export type DeleteResult = Awaited<ReturnType<typeof deleteTaskAction>>;
export type UndoCompleteResult = Awaited<ReturnType<typeof undoCompleteAction>>;

// アクションの成功値。既定の解決値（beforeEach）と `hold` の保険（settleOnCleanup）で共用する
export const OK: DailyActionResult = { ok: true };
export const CREATED: CreatingActionResult = { ok: true, createdId: 99 };
export const DELETE_OK: DeleteResult = { ok: true, deleted: task({ id: 0, name: "片付け" }) };
export const UNCOMPLETE_OK: UndoCompleteResult = { ok: true, snapshot: SNAPSHOT };

type BoardProps = ComponentProps<typeof DailyBoard>;

function boardProps(tasks: readonly Task[], over: Partial<BoardProps>): BoardProps {
  return {
    date: TEST_DATE,
    today: TEST_DATE,
    isToday: true,
    groups: groupTasksBySection(tasks, SECTIONS),
    modes: MODES,
    projects: PROJECTS,
    sections: SECTIONS,
    staleRunningTask: null,
    ...over,
  };
}

export function renderBoard(tasks: readonly Task[] = defaultTasks(), over: Partial<BoardProps> = {}) {
  const view = render(<DailyBoard {...boardProps(tasks, over)} />);
  return {
    ...view,
    /** サーバ確定後の再取得（revalidatePath による Server Component の再描画）を模す */
    applyServerState: (next: readonly Task[]) =>
      view.rerender(<DailyBoard {...boardProps(next, over)} />),
  };
}

/** `hold` が積む保険。`setupBoard` の afterEach が未解決の保留をまとめて解決する */
const heldGates: (() => Promise<void>)[] = [];

/**
 * Server Action を保留させ、解決の瞬間をテストが握る（楽観的更新の「確定前」を観測するため）。
 * React は未完了の非同期アクションを束ねて扱うので、**解決し忘れた保留は後続テストの巻き戻しまで
 * 止めてしまう**（嘘の赤になる）。取りこぼしても壊れないよう afterEach が保険で解決する。
 *
 * 応答を待って反映する画面には共有の `deferredAction`（`@/app/_testing/actions`）を使う。
 * **こちらが要るのは楽観的更新（N-01）＋ transition を持つデイリーだけ**——`ActionResult` 以外の
 * 返り値を扱い、`resolve` が `act` 包みで再描画まで流し、解決漏れの保険を持つ。
 *
 * **型引数は省略しない**。成功値定数は宣言型より狭い初期値を持つため、推論に任せると `T` が
 * `{ ok: true }` へ狭まり、`resolve({ ok: false, ... })` が型エラーになる。
 *
 * **保険を積むのは `setupBoard()` の afterEach** なので、これを呼ばないファイルで使うと
 * 解決漏れがそのまま残り、後続テストが嘘の赤になる。
 *
 * @param settleOnCleanup afterEach の保険で使う値（テスト本体が `resolve` すれば使われない）。
 *   型引数に対応する成功値定数（`OK` / `CREATED` / `DELETE_OK` / `UNCOMPLETE_OK`）を渡す
 */
export function hold<T>(settleOnCleanup: T) {
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

/** クリックでの行選択（§5: マウス操作とキーボード操作は等価） */
export function selectRow(name: string) {
  clickWithoutServer(taskRow(name));
}

/** グローバルショートカット（§6）。フックが window で購読しているので body へ送る */
export function press(key: string, init: KeyboardEventInit = {}) {
  fireEvent.keyDown(document.body, { key, ...init });
}

export async function pressAndSettle(key: string, init: KeyboardEventInit = {}) {
  await act(async () => {
    press(key, init);
  });
}

export function quickAddInput(): HTMLElement {
  return screen.getByPlaceholderText("タスク名を入力して Enter で追加");
}

/** インライン編集の確定（00_共通 §2.3: Enter または blur で確定） */
export function commit(input: HTMLElement, value: string) {
  fireEvent.change(input, { target: { value } });
  fireEvent.keyDown(input, { key: "Enter" });
}

/** コメントの入力欄（O-16）。クイック追加欄も textbox なので placeholder で絞る */
export function commentInput(): HTMLElement {
  return screen.getByPlaceholderText("コメント（Shift+Enter で改行）");
}

/**
 * 盤面テストの前後処理を登録する。**盤面を描くファイルが先頭で1回呼ぶ**。積むのは4つ——
 * ①jsdom に無い API の詰め物（`ResizeObserver` / `scrollIntoView`）②固定時計（`NOW`）
 * ③全 Server Action の既定解決値 ④保留（`hold`）の解決漏れの後始末。
 *
 * **先に `vi.mock("../actions", ...)` を敷いていること**が前提（③が `vi.mocked` を通すため）。
 * 忘れると「`mockResolvedValue is not a function`」という原因の読めない失敗になる
 */
export function setupBoard(): void {
  beforeEach(() => {
    ResizeObserverStub.latest = null;
    vi.stubGlobal("ResizeObserver", ResizeObserverStub);
    // 選択行のスクロール追従（§5）は jsdom では測れない（幾何は段3送り）。呼び出し自体は通す
    Element.prototype.scrollIntoView = () => {};
    vi.useFakeTimers({ toFake: ["Date"], now: NOW });

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
    vi.mocked(setTaskHighlightAction).mockResolvedValue(OK);
    vi.mocked(setTaskModeAction).mockResolvedValue(OK);
    vi.mocked(setTaskProjectAction).mockResolvedValue(OK);
    vi.mocked(setTaskSectionAction).mockResolvedValue(OK);
    vi.mocked(startTaskAction).mockResolvedValue(OK);
    vi.mocked(suspendTaskAction).mockResolvedValue(OK);
    vi.mocked(undoStartAction).mockResolvedValue(OK);
    vi.mocked(updateTaskCommentAction).mockResolvedValue(OK);
    vi.mocked(updateTaskEstimateAction).mockResolvedValue(OK);
    vi.mocked(updateTaskPunchAction).mockResolvedValue(OK);
    // 削除・完了の取り消しは Undo（O-8 / O-15）に要る値を返す契約なので、対象から組んで返す
    vi.mocked(deleteTaskAction).mockImplementation(async (id) => ({
      ok: true,
      deleted: defaultTasks().find((t) => t.id === id) ?? task({ id, name: "不明" }),
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
}
