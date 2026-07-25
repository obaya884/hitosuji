import { fireEvent, render, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/domain/task/task";

import type { EditField } from "./daily-list";
import { useDailyShortcuts, type DailyShortcutParams } from "./use-daily-shortcuts";

// キー割り当ての正は画面定義書01 §6、修飾キー・IME・テキスト入力中の除外は 00_共通 §3。
// このフックの出力は「どのコールバックがどの引数で呼ばれたか」だけなので、境界のコールバックを
// vi.fn() で受けて出力を読む（呼ばれ方を検証するモックではなく、唯一の出力を見る状態検証）。
// 内側の協力者（domain の moveSelection / currentTaskId / taskStatus）は本物を使う。

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-26",
    name: `T${over.id}`,
    estimateMinutes: 0,
    sectionId: null,
    modeId: null,
    projectId: null,
    sortOrder: over.id * 1000,
    startedAt: null,
    endedAt: null,
    comment: null,
    routineId: null,
    splitParentId: null,
    postponedCount: 0,
    ...over,
  };
}

const COMPLETED = task({
  id: 1,
  startedAt: new Date("2026-07-26T09:00:00"),
  endedAt: new Date("2026-07-26T09:30:00"),
});
const RUNNING = task({ id: 2, startedAt: new Date("2026-07-26T10:00:00") });
const NEXT_UP = task({ id: 3 });
const LATER = task({ id: 4 });
/** 表示順（完了 → 実行中 → 未実行2件）。現在地（§5）は実行中の RUNNING */
const TASKS: readonly Task[] = [COMPLETED, RUNNING, NEXT_UP, LATER];

/** §6 の一覧に載っている全キー。除外規則が「全ショートカット」に効くかを見るのに使う */
const ALL_SHORTCUT_KEYS: readonly (readonly [key: string, init: KeyboardEventInit])[] = [
  ["j", {}],
  ["k", {}],
  ["c", {}],
  ["Enter", {}],
  ["i", {}],
  ["a", {}],
  ["r", {}],
  ["F2", {}],
  ["e", {}],
  ["b", {}],
  ["f", {}],
  ["m", {}],
  ["p", {}],
  ["s", {}],
  ["y", {}],
  ["d", {}],
  ["u", {}],
  ["t", {}],
  ["g", {}],
  ["J", { shiftKey: true }],
  ["K", { shiftKey: true }],
  ["H", { shiftKey: true }],
  ["L", { shiftKey: true }],
  ["?", { shiftKey: true }],
];

/** 編集を開くキーと開く欄（§6 R / F2 / E / B / F / M / P / S） */
const EDIT_KEYS: readonly (readonly [key: string, field: EditField])[] = [
  ["r", "name"],
  ["F2", "name"],
  ["e", "estimate"],
  ["b", "startedAt"],
  ["f", "endedAt"],
  ["m", "mode"],
  ["p", "project"],
  ["s", "section"],
];

function makeSpies() {
  const quickAdd = document.createElement("input");
  return {
    quickAdd,
    spies: {
      setEditing: vi.fn(),
      setShowHelp: vi.fn(),
      setSelectedId: vi.fn(),
      openDatePicker: vi.fn(),
      moveByStep: vi.fn(),
      punch: vi.fn(),
      operate: vi.fn(),
      unstart: vi.fn(),
      uncomplete: vi.fn(),
      undoPending: vi.fn(),
      /** router.push（日付移動） */
      push: vi.fn(),
      /** quickAddRef.current.focus()（A キー） */
      focus: vi.spyOn(quickAdd, "focus"),
    },
  };
}

type Spies = ReturnType<typeof makeSpies>["spies"];

function params(
  spies: Spies,
  quickAdd: HTMLInputElement,
  overrides: Partial<DailyShortcutParams> = {}
): DailyShortcutParams {
  return {
    editing: null,
    pickerOpen: false,
    orderedTasks: TASKS,
    selectedId: RUNNING.id,
    hasPendingUndo: false,
    date: "2026-07-26",
    quickAddRef: { current: quickAdd },
    router: { push: spies.push },
    setEditing: spies.setEditing,
    setShowHelp: spies.setShowHelp,
    setSelectedId: spies.setSelectedId,
    openDatePicker: spies.openDatePicker,
    moveByStep: spies.moveByStep,
    punch: spies.punch,
    operate: spies.operate,
    unstart: spies.unstart,
    uncomplete: spies.uncomplete,
    undoPending: spies.undoPending,
    ...overrides,
  };
}

function renderShortcuts(overrides: Partial<DailyShortcutParams> = {}) {
  const { spies, quickAdd } = makeSpies();
  const view = renderHook(useDailyShortcuts, {
    initialProps: params(spies, quickAdd, overrides),
  });
  return {
    spies,
    /** 呼び出し元の再レンダリングを模す（変えたい引数だけ渡す） */
    rerender: (next: Partial<DailyShortcutParams> = {}) =>
      view.rerender(params(spies, quickAdd, { ...overrides, ...next })),
    unmount: view.unmount,
  };
}

type StatefulProps = Readonly<{
  spies: Spies;
  quickAdd: HTMLInputElement;
  initialSelectedId: number | null;
  initialShowHelp: boolean;
  orderedTasks: readonly Task[];
}>;

/**
 * 選択行とヘルプ表示だけ本物の useState で持つ版のフック。
 * この2つは更新関数（`(current) => next`）を渡されるため、呼び出し引数ではなく
 * 「押した結果どの状態になるか」を検証する
 */
function useShortcutsWithState(props: StatefulProps) {
  const [selectedId, setSelectedId] = useState<number | null>(props.initialSelectedId);
  const [showHelp, setShowHelp] = useState(props.initialShowHelp);
  useDailyShortcuts(
    params(props.spies, props.quickAdd, {
      orderedTasks: props.orderedTasks,
      selectedId,
      setSelectedId,
      setShowHelp,
    })
  );
  return { selectedId, showHelp };
}

function renderStateful(
  initial: Readonly<{
    selectedId?: number | null;
    showHelp?: boolean;
    orderedTasks?: readonly Task[];
  }> = {}
) {
  const { spies, quickAdd } = makeSpies();
  const view = renderHook(useShortcutsWithState, {
    initialProps: {
      spies,
      quickAdd,
      initialSelectedId: initial.selectedId ?? RUNNING.id,
      initialShowHelp: initial.showHelp ?? false,
      orderedTasks: initial.orderedTasks ?? TASKS,
    },
  });
  return { state: view.result, spies };
}

/** window へキーを送り、preventDefault されたかを返す（§6・00_共通 §3: 既定動作の抑止は最小化） */
function press(key: string, init: KeyboardEventInit = {}): boolean {
  return !fireEvent.keyDown(window, { key, ...init });
}

/** §6 の全キーを順に送る（除外規則が全ショートカットに効くかの検証用） */
function pressAll(target: Window | Element = window, extraInit: KeyboardEventInit = {}) {
  for (const [key, init] of ALL_SHORTCUT_KEYS) {
    fireEvent.keyDown(target, { key, ...init, ...extraInit });
  }
}

/** キーの target になる実要素（§6 の除外規則の検証用） */
function renderFocusTargets() {
  const { container } = render(
    <>
      <input />
      <textarea />
      <button />
    </>
  );
  return {
    input: container.querySelector("input") as HTMLInputElement,
    textarea: container.querySelector("textarea") as HTMLTextAreaElement,
    button: container.querySelector("button") as HTMLButtonElement,
  };
}

/** フックが何も出力しなかったこと（呼ばれたコールバック名の一覧を空と比べる） */
function expectNothingCalled(spies: Spies) {
  const called = Object.entries(spies)
    .filter(([, spy]) => spy.mock.calls.length > 0)
    .map(([name]) => name);
  expect(called).toEqual([]);
}

describe("useDailyShortcuts（画面定義書01 §6: デイリーのキーボードショートカット）", () => {
  describe("選択行の移動（§6 J / K / C・§5 行選択モデル）", () => {
    it("J は選択行を1つ下へ動かす", () => {
      const { state } = renderStateful({ selectedId: RUNNING.id });

      press("j");

      expect(state.current.selectedId).toBe(NEXT_UP.id);
    });

    it("K は選択行を1つ上へ動かす", () => {
      const { state } = renderStateful({ selectedId: NEXT_UP.id });

      press("k");

      expect(state.current.selectedId).toBe(RUNNING.id);
    });

    it("C は現在地（実行中タスク）へジャンプする", () => {
      const { state } = renderStateful({ selectedId: LATER.id });

      press("c");

      expect(state.current.selectedId).toBe(RUNNING.id);
    });

    it("C は実行中がなければ最初の未実行タスクへジャンプする（初期選択と同じ規則）", () => {
      const { state } = renderStateful({
        selectedId: LATER.id,
        orderedTasks: [COMPLETED, NEXT_UP, LATER],
      });

      press("c");

      expect(state.current.selectedId).toBe(NEXT_UP.id);
    });

    it("矢印キーは選択行に割り当てない（§6 / FB-33）", () => {
      const { state, spies } = renderStateful({ selectedId: RUNNING.id });

      press("ArrowDown");
      press("ArrowUp");

      expect(state.current.selectedId).toBe(RUNNING.id);
      expectNothingCalled(spies);
    });
  });

  describe("打刻（§6 Enter）", () => {
    it("Enter は選択タスクを打刻へ渡す", () => {
      const { spies } = renderShortcuts({ selectedId: RUNNING.id });

      press("Enter");

      expect(spies.punch).toHaveBeenCalledOnce();
      expect(spies.punch).toHaveBeenCalledWith(RUNNING);
    });

    it("完了タスクの選択中も同じく punch へ渡す（複製して開始 O-14 の判定は punch 側）", () => {
      const { spies } = renderShortcuts({ selectedId: COMPLETED.id });

      press("Enter");

      expect(spies.punch).toHaveBeenCalledWith(COMPLETED);
    });

    it("選択がなければ打刻しない", () => {
      const { spies } = renderShortcuts({ selectedId: null });

      press("Enter");

      expectNothingCalled(spies);
    });

    // ボタンにフォーカスが残っていると Enter でブラウザがそのボタンを押すため、
    // ここで打刻すると二重に発火する（打刻ボタンを押した直後など）
    it("ボタンにフォーカスがあるときの Enter は打刻しない（二重発火を防ぐ）", () => {
      const { spies } = renderShortcuts();
      const { button } = renderFocusTargets();

      fireEvent.keyDown(button, { key: "Enter" });

      expectNothingCalled(spies);
    });
  });

  describe("行操作（§6 I / Y / D）", () => {
    it.each([
      ["i", "suspend"],
      ["y", "duplicate"],
      ["d", "delete"],
    ] as const)("%s は選択タスクに %s を要求する", (key, operation) => {
      const { spies } = renderShortcuts();

      press(key);

      expect(spies.operate).toHaveBeenCalledOnce();
      expect(spies.operate).toHaveBeenCalledWith(RUNNING, operation);
    });

    it.each(["i", "y", "d"])("%s は選択がなければ何もしない", (key) => {
      const { spies } = renderShortcuts({ selectedId: null });

      press(key);

      expectNothingCalled(spies);
    });

    it("§6 の一覧に無いキーは何もしない（先送り O-7・ルーチン化 O-12 にキーを割り当てない）", () => {
      const { spies } = renderShortcuts();

      // o(先送り)・n(ルーチン)・h/l(Shift なしの日付移動)・Space（00_共通 §3 で使わない）
      for (const key of ["o", "n", "h", "l", "x", "z", " ", "Tab", "Escape"]) press(key);

      expectNothingCalled(spies);
    });

    it("§6 で Shift に割り当てのないキー（予約中の Shift+C 等）は何もしない", () => {
      const { spies } = renderShortcuts();

      for (const key of ["C", "D", "Y", "A", "T", "G"]) press(key, { shiftKey: true });

      expectNothingCalled(spies);
    });
  });

  describe("取り消し（§6 U・切り分けの正は O-13）", () => {
    it("取り消しの保留があればそれを最優先する（選択行の状態は見ない。O-13 / FB-37）", () => {
      const { spies } = renderShortcuts({ hasPendingUndo: true, selectedId: RUNNING.id });

      press("u");

      expect(spies.undoPending).toHaveBeenCalledOnce();
      expect(spies.unstart).not.toHaveBeenCalled();
      expect(spies.uncomplete).not.toHaveBeenCalled();
    });

    it("保留がなく実行中タスクを選択中なら開始打刻を取り消す（O-13 / F-210）", () => {
      const { spies } = renderShortcuts({ selectedId: RUNNING.id });

      press("u");

      expect(spies.unstart).toHaveBeenCalledOnce();
      expect(spies.unstart).toHaveBeenCalledWith(RUNNING);
      expect(spies.uncomplete).not.toHaveBeenCalled();
      expect(spies.undoPending).not.toHaveBeenCalled();
    });

    it("保留がなく完了タスクを選択中なら完了を取り消す（O-15 / F-212）", () => {
      const { spies } = renderShortcuts({ selectedId: COMPLETED.id });

      press("u");

      expect(spies.uncomplete).toHaveBeenCalledOnce();
      expect(spies.uncomplete).toHaveBeenCalledWith(COMPLETED);
      expect(spies.unstart).not.toHaveBeenCalled();
    });

    it("保留がなく未実行タスクを選択中は何もしない（O-13）", () => {
      const { spies } = renderShortcuts({ selectedId: NEXT_UP.id });

      press("u");

      expectNothingCalled(spies);
    });

    it("保留がなく選択もなければ何もしない", () => {
      const { spies } = renderShortcuts({ selectedId: null });

      press("u");

      expectNothingCalled(spies);
    });
  });

  describe("並び替え（§6 Shift+J / Shift+K・O-6）", () => {
    it("Shift+J はタスクを1段下げる（選択行は動かさない）", () => {
      const { state, spies } = renderStateful({ selectedId: RUNNING.id });

      press("J", { shiftKey: true });

      expect(spies.moveByStep).toHaveBeenCalledOnce();
      expect(spies.moveByStep).toHaveBeenCalledWith(1);
      expect(state.current.selectedId).toBe(RUNNING.id);
    });

    it("Shift+K はタスクを1段上げる", () => {
      const { state, spies } = renderStateful({ selectedId: RUNNING.id });

      press("K", { shiftKey: true });

      expect(spies.moveByStep).toHaveBeenCalledWith(-1);
      expect(state.current.selectedId).toBe(RUNNING.id);
    });

    it("Shift なしの J / K は並び替えず選択行だけ動かす", () => {
      const { state, spies } = renderStateful({ selectedId: RUNNING.id });

      press("j");

      expect(spies.moveByStep).not.toHaveBeenCalled();
      expect(state.current.selectedId).toBe(NEXT_UP.id);
    });
  });

  describe("日付移動（§6 Shift+H / Shift+L / T / G）", () => {
    it("Shift+H は前日へ移動する", () => {
      const { spies } = renderShortcuts({ date: "2026-03-01" });

      press("H", { shiftKey: true });

      expect(spies.push).toHaveBeenCalledWith("/?date=2026-02-28");
    });

    it("Shift+L は翌日へ移動する", () => {
      const { spies } = renderShortcuts({ date: "2026-02-28" });

      press("L", { shiftKey: true });

      expect(spies.push).toHaveBeenCalledWith("/?date=2026-03-01");
    });

    it("T は今日（日付クエリなし）へ戻る", () => {
      const { spies } = renderShortcuts({ date: "2026-02-28" });

      press("t");

      expect(spies.push).toHaveBeenCalledWith("/");
    });

    it("G は datepicker を開く（§3.1）", () => {
      const { spies } = renderShortcuts();

      press("g");

      expect(spies.openDatePicker).toHaveBeenCalledOnce();
      expect(spies.push).not.toHaveBeenCalled();
    });
  });

  describe("インライン編集の開始（§6 R / F2 / E / B / F / M / P / S）", () => {
    it.each(EDIT_KEYS)("%s は選択行の %s の編集を開く", (key, field) => {
      const { spies } = renderShortcuts();

      press(key);

      expect(spies.setEditing).toHaveBeenCalledOnce();
      expect(spies.setEditing).toHaveBeenCalledWith({ taskId: RUNNING.id, field });
    });

    it.each(EDIT_KEYS)("%s は選択がなければ編集を開かない", (key) => {
      const { spies } = renderShortcuts({ selectedId: null });

      press(key);

      expectNothingCalled(spies);
    });
  });

  describe("クイック追加（§6 A）", () => {
    it("A はクイック追加欄へフォーカスする", () => {
      const { spies } = renderShortcuts();

      press("a");

      expect(spies.focus).toHaveBeenCalledOnce();
    });

    it("クイック追加欄が無いときも落ちない", () => {
      const { spies } = renderShortcuts({ quickAddRef: { current: null } });

      press("a");

      expectNothingCalled(spies);
    });
  });

  describe("ショートカット一覧（§6 ?）", () => {
    it("? で一覧を表示する", () => {
      const { state } = renderStateful({ showHelp: false });

      press("?", { shiftKey: true });

      expect(state.current.showHelp).toBe(true);
    });

    it("? をもう一度押すと閉じる（表示・非表示のトグル）", () => {
      const { state } = renderStateful({ showHelp: true });

      press("?", { shiftKey: true });

      expect(state.current.showHelp).toBe(false);
    });

    // ? は Shift+/ で入力されるため、Shift 分岐（並び替え・日付移動）より先に処理する
    it("? は Shift 併用でも並び替え・日付移動に食われない", () => {
      const { state, spies } = renderStateful();

      press("?", { shiftKey: true });

      expect(state.current.showHelp).toBe(true);
      expect(spies.moveByStep).not.toHaveBeenCalled();
      expect(spies.push).not.toHaveBeenCalled();
    });
  });

  describe("ショートカットの無効化（00_共通 §3 / §6 の除外規則）", () => {
    it("インライン編集・選択ポップオーバー表示中は全ショートカットを無効にする（00_共通 §3 / F-112）", () => {
      const { spies } = renderShortcuts({ editing: { taskId: RUNNING.id, field: "name" } });

      pressAll();

      expectNothingCalled(spies);
    });

    it("datepicker 表示中は行操作キーを背後のリストへ流さない（§6 / §3.1）", () => {
      const { spies } = renderShortcuts({ pickerOpen: true });

      pressAll();

      expectNothingCalled(spies);
    });

    it.each([
      ["Cmd", { metaKey: true }],
      ["Ctrl", { ctrlKey: true }],
      ["Alt", { altKey: true }],
    ] as const)("%s 併用時は何もしない（修飾キーは Shift のみ。00_共通 §3）", (_label, modifier) => {
      const { spies } = renderShortcuts();

      pressAll(window, modifier);

      expectNothingCalled(spies);
    });

    it("テキスト入力中（INPUT にフォーカス）は無効（00_共通 §3）", () => {
      const { spies } = renderShortcuts();
      const { input } = renderFocusTargets();

      pressAll(input);

      expectNothingCalled(spies);
    });

    it("テキスト入力中（TEXTAREA にフォーカス）は無効（00_共通 §3）", () => {
      const { spies } = renderShortcuts();
      const { textarea } = renderFocusTargets();

      pressAll(textarea);

      expectNothingCalled(spies);
    });

    it("IME変換中のキーは操作として扱わない（00_共通 §3）", () => {
      const { spies } = renderShortcuts();

      pressAll(window, { isComposing: true });

      expectNothingCalled(spies);
    });
  });

  describe("既定動作の抑止は最小限（§6 / 00_共通 §3）", () => {
    // 押したキー自体が入力欄・編集欄へ入るのを防ぐ必要があるものだけ止める
    it.each(["a", "g", ...EDIT_KEYS.map(([key]) => key)])("%s は既定動作を止める", (key) => {
      renderShortcuts();

      expect(press(key)).toBe(true);
    });

    it.each([
      ["j", {}],
      ["k", {}],
      ["c", {}],
      ["Enter", {}],
      ["i", {}],
      ["y", {}],
      ["d", {}],
      ["u", {}],
      ["t", {}],
      ["J", { shiftKey: true }],
      ["K", { shiftKey: true }],
      ["H", { shiftKey: true }],
      ["L", { shiftKey: true }],
      ["?", { shiftKey: true }],
    ] as const)("%s は既定動作を止めない", (key, init) => {
      renderShortcuts();

      expect(press(key, init)).toBe(false);
    });

    it("編集キーでも選択がなければ既定動作を止めない", () => {
      renderShortcuts({ selectedId: null });

      expect(press("r")).toBe(false);
    });
  });

  describe("リスナの登録", () => {
    it("再レンダリングしても1回の押下で1回しか呼ばれない（登録が重複しない）", () => {
      const { spies, rerender } = renderShortcuts();

      rerender();
      rerender();
      press("Enter");

      expect(spies.punch).toHaveBeenCalledOnce();
    });

    it("再レンダリング後は最新の選択行に作用する", () => {
      const { spies, rerender } = renderShortcuts({ selectedId: RUNNING.id });

      rerender({ selectedId: NEXT_UP.id });
      press("Enter");

      expect(spies.punch).toHaveBeenCalledWith(NEXT_UP);
    });

    it("アンマウント後はキーを拾わない", () => {
      const { spies, unmount } = renderShortcuts();

      unmount();
      pressAll();

      expectNothingCalled(spies);
    });
  });
});
