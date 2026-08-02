import { fireEvent, render, renderHook } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { Task } from "@/domain/task/task";
import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";

import type { EditField } from "../_lib/editing";
import { SHORTCUT_KEYS, type KeyStroke } from "../_lib/shortcuts";
import { useDailyShortcuts, type DailyShortcutParams } from "./use-daily-shortcuts";

// キー割り当ての正は画面定義書01 §6、修飾キー・IME・テキスト入力中の除外は 00_共通 §3。
// このフックの出力は「どのコールバックがどの引数で呼ばれたか」だけなので、境界のコールバックを
// vi.fn() で受けて出力を読む（呼ばれ方を検証するモックではなく、唯一の出力を見る状態検証）。
// 内側の協力者（domain の moveSelection / currentTaskId / taskStatus）は本物を使う。

const COMPLETED = task({ id: 1, startedAt: atJst("09:00"), endedAt: atJst("09:30") });
const RUNNING = task({ id: 2, startedAt: atJst("10:00") });
const NEXT_UP = task({ id: 3 });
const LATER = task({ id: 4 });
/** 表示順（完了 → 実行中 → 未実行2件）。現在地（§5）は実行中の RUNNING */
const TASKS: readonly Task[] = [COMPLETED, RUNNING, NEXT_UP, LATER];

/**
 * 表が割り当てている全キーを `fireEvent` へ渡す形にしたもの。除外規則が「全ショートカット」に
 * 効くかを見るのに使う。**写しを持たず `_lib/shortcuts.ts` から導く**（理由は同ファイル冒頭）
 */
const SHORTCUT_PRESSES: readonly (readonly [key: string, init: KeyboardEventInit])[] =
  SHORTCUT_KEYS.map(({ key, shiftKey }) => [key, { shiftKey }]);

/**
 * 掃き出しの母集合。**割り当ての候補になりうるキーを、素押しと Shift 併用の両方で並べる**
 * （英字は Shift を押すと `key` 自体が大文字で届くので大小どちらも入れる）。
 * ここから割り当て済みを引いた残りが「押しても何も起きないはずのキー」になる。
 *
 * `?` だけは入れない——Shift+/ で入るため表では Shift 併用で持つ一方、ディスパッチャは Shift
 * 分岐より先に `?` を見る。**素押しの `?` は通常の配列で入力できずどちらでもよい**ので、
 * 拾う側にも拾わない側にも主張を置かない。**そのぶん表の `?` 行の `shiftKey` は両方向の
 * どちらからも固定されない**（他のキーは肯定側と否定側の挟み撃ちで Shift の有無まで決まる）
 */
const CANDIDATE_KEYS: readonly KeyStroke[] = [
  ..."abcdefghijklmnopqrstuvwxyz",
  ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  ..."0123456789",
  ..."!\"#$%&'()-=^~|@`[]{};:+*,.<>/_\\",
  ...Array.from({ length: 12 }, (_, i) => `F${i + 1}`),
  "Enter",
  "Escape",
  "Tab",
  " ",
  "Backspace",
  "Delete",
  "Home",
  "End",
  "PageUp",
  "PageDown",
  "Insert",
  "ContextMenu",
  // 修飾キー自身の keydown（「Shift を押しただけで行が動く」型の割り当てを拾う枠）
  "Shift",
  "Control",
  "Alt",
  "Meta",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
].flatMap((key) => [
  { key, shiftKey: false },
  { key, shiftKey: true },
]);

/**
 * 掃き出しを回す状態。**1状態だけだと状態ガード付きの割り当てを見逃す**——
 * 「未実行のときだけ先送りする」のような分岐を足しても、その状態で押していなければ緑になる。
 * 振っているのは**選択行の状態**（と取り消しの保留）の1軸で、`editing` / `pickerOpen` は
 * 振らない——あの2つはショートカット自体を止めるので、掃き出しの目的（有効な状態で
 * 拾われないこと）から外れる
 */
const SWEEP_STATES: readonly (readonly [
  label: string,
  overrides: Partial<DailyShortcutParams>,
])[] = [
  ["未選択", { selectedId: null }],
  ["未実行を選択中", { selectedId: NEXT_UP.id }],
  ["実行中を選択中", { selectedId: RUNNING.id }],
  ["完了を選択中", { selectedId: COMPLETED.id }],
  ["取り消しの保留あり", { selectedId: COMPLETED.id, hasPendingUndo: true }],
];

/** 母集合のうち表に載っていないキー。**ディスパッチャが拾ってはいけない側** */
const UNASSIGNED_KEYS = CANDIDATE_KEYS.filter(
  (candidate) =>
    !SHORTCUT_KEYS.some(
      (assigned) => assigned.key === candidate.key && assigned.shiftKey === candidate.shiftKey
    )
);

/** 編集を開くキーと開く欄（§6 R / E / B / F / M / P / S / C） */
const EDIT_KEYS: readonly (readonly [key: string, field: EditField])[] = [
  ["r", "name"],
  ["e", "estimate"],
  ["b", "startedAt"],
  ["f", "endedAt"],
  ["m", "mode"],
  ["p", "project"],
  ["s", "section"],
  ["c", "comment"],
];

/** 打刻の有無を見ない編集キー（B / F 以外）。ガードが打刻2フィールドに閉じていることの検証に使う */
const NON_PUNCH_EDIT_KEYS = EDIT_KEYS.filter(([, field]) => field !== "startedAt" && field !== "endedAt");

/** 終了打刻を持たない選択行（`F` を受け付けない状態。§3.3） */
const NO_ENDED_AT_SELECTIONS: readonly (readonly [label: string, selectedId: number])[] = [
  ["未実行", NEXT_UP.id],
  ["実行中", RUNNING.id],
];

/** 押したキー自体が入力欄・編集欄へ入るのを防ぐため既定動作を止めるキー（§6 A / G ＋ 編集キー） */
const PREVENT_DEFAULT_KEYS: readonly string[] = ["a", "g", ...EDIT_KEYS.map(([key]) => key)];

/** 残りの §6 のキーは既定動作を止めない（00_共通 §3: 抑止は最小化）。一覧は上の1か所だけで持つ */
const KEEP_DEFAULT_KEYS = SHORTCUT_PRESSES.filter(
  ([key]) => !PREVENT_DEFAULT_KEYS.includes(key)
);

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
      toggleHighlight: vi.fn(),
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
    currentSectionId: null,
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
    toggleHighlight: spies.toggleHighlight,
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
  currentSectionId: number | null;
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
      currentSectionId: props.currentSectionId,
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
    currentSectionId?: number | null;
  }> = {}
) {
  // 既定値は分割代入で与える（?? だと明示した null が既定値に化け、未選択を書けなくなる）
  const {
    selectedId = RUNNING.id,
    showHelp = false,
    orderedTasks = TASKS,
    currentSectionId = null,
  } = initial;
  const { spies, quickAdd } = makeSpies();
  const view = renderHook(useShortcutsWithState, {
    initialProps: {
      spies,
      quickAdd,
      initialSelectedId: selectedId,
      initialShowHelp: showHelp,
      orderedTasks,
      currentSectionId,
    },
  });
  return { state: view.result, spies };
}

/** 指定要素（既定は window）へキーを送り、既定動作が保たれたか（＝抑止されなかったか）を返す */
function pressKey(
  key: string,
  init: KeyboardEventInit = {},
  target: Window | Element = window
): boolean {
  return fireEvent.keyDown(target, { key, ...init });
}

/** preventDefault されたかを返す（§6・00_共通 §3: 既定動作の抑止は最小化） */
function pressDefaultPrevented(key: string, init: KeyboardEventInit = {}): boolean {
  return !pressKey(key, init);
}

/** §6 の全キーを順に送る（除外規則が全ショートカットに効くかの検証用） */
function pressAll(target: Window | Element = window, extraInit: KeyboardEventInit = {}) {
  for (const [key, init] of SHORTCUT_PRESSES) {
    pressKey(key, { ...init, ...extraInit }, target);
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

/** 呼ばれたコールバックの名前（このフックの唯一の出力。どれが呼ばれたかを名前で読む） */
function calledSpyNames(spies: Spies): string[] {
  return Object.entries(spies)
    .filter(([, spy]) => spy.mock.calls.length > 0)
    .map(([name]) => name);
}

/** フックが何も出力しなかったこと */
function expectNothingCalled(spies: Spies) {
  expect(calledSpyNames(spies)).toEqual([]);
}

describe("useDailyShortcuts（画面定義書01 §6: デイリーのキーボードショートカット）", () => {
  describe("選択行の移動（§6 J / K / N・§5 行選択モデル）", () => {
    it("J は選択行を1つ下へ動かす", () => {
      const { state } = renderStateful({ selectedId: RUNNING.id });

      pressKey("j");

      expect(state.current.selectedId).toBe(NEXT_UP.id);
    });

    it("K は選択行を1つ上へ動かす", () => {
      const { state } = renderStateful({ selectedId: NEXT_UP.id });

      pressKey("k");

      expect(state.current.selectedId).toBe(RUNNING.id);
    });

    it("N は現在地（実行中タスク）へジャンプする", () => {
      const { state } = renderStateful({ selectedId: LATER.id });

      pressKey("n");

      expect(state.current.selectedId).toBe(RUNNING.id);
    });

    it("N は実行中がなく現在セクションも定まらなければ表示順で最初の未実行へジャンプする（§5 規則4）", () => {
      const { state } = renderStateful({
        selectedId: LATER.id,
        orderedTasks: [COMPLETED, NEXT_UP, LATER],
      });

      pressKey("n");

      expect(state.current.selectedId).toBe(NEXT_UP.id);
    });

    it("N は現在セクションを現在地の探索へ渡す（未分類が先頭にあってもそちらへ飛ばない。§5 / FB-78）", () => {
      const inCurrentSection = task({ id: 5, sectionId: 20 });
      const { state } = renderStateful({
        selectedId: LATER.id,
        // NEXT_UP・LATER は未分類（リスト先頭のインボックス）
        orderedTasks: [COMPLETED, NEXT_UP, LATER, inCurrentSection],
        currentSectionId: 20,
      });

      pressKey("n");

      expect(state.current.selectedId).toBe(inCurrentSection.id);
    });

    it("現在地が無ければ（全件完了）N は選択を変えない（§5: 選択行は常に1つ）", () => {
      const { state } = renderStateful({
        selectedId: COMPLETED.id,
        orderedTasks: [COMPLETED],
      });

      pressKey("n");

      expect(state.current.selectedId).toBe(COMPLETED.id);
    });

    it("未選択のまま J を押すと先頭行が選択される（§5: 選択行は常に1つ）", () => {
      const { state } = renderStateful({ selectedId: null });

      pressKey("j");

      expect(state.current.selectedId).toBe(COMPLETED.id);
    });

    it("矢印キーは選択行に割り当てない（§6 / FB-33）", () => {
      const { state, spies } = renderStateful({ selectedId: RUNNING.id });

      pressKey("ArrowDown");
      pressKey("ArrowUp");

      expect(state.current.selectedId).toBe(RUNNING.id);
      // setSelectedId / setShowHelp は本物の useState に差し替わっているので、この
      // expectNothingCalled が見るのは残り（打刻・行操作・日付移動・編集）。
      // 選択が動いていないことは上の据え置き assert が担う
      expectNothingCalled(spies);
    });
  });

  describe("ハイライト（§6 H / O-17 / F-118）", () => {
    it("H は選択タスクをトグルへ渡す", () => {
      const { spies } = renderShortcuts({ selectedId: RUNNING.id });

      pressKey("h");

      expect(spies.toggleHighlight).toHaveBeenCalledOnce();
      expect(spies.toggleHighlight).toHaveBeenCalledWith(RUNNING);
    });

    // 状態を問わない（O-17）。完了タスクでも同じくトグルへ渡す
    it("完了タスクの選択中も同じくトグルへ渡す", () => {
      const { spies } = renderShortcuts({ selectedId: COMPLETED.id });

      pressKey("h");

      expect(spies.toggleHighlight).toHaveBeenCalledWith(COMPLETED);
    });

    it("選択行が無ければ何もしない", () => {
      const { spies } = renderShortcuts({ selectedId: null });

      pressKey("h");

      expect(spies.toggleHighlight).not.toHaveBeenCalled();
    });

    // Shift+H は前日移動（§6）。単独 H と取り違えない
    it("Shift+H はハイライトではなく前日移動になる", () => {
      const { spies } = renderShortcuts({ selectedId: RUNNING.id });

      pressKey("H", { shiftKey: true });

      expect(spies.toggleHighlight).not.toHaveBeenCalled();
      expect(spies.push).toHaveBeenCalledOnce();
    });
  });

  describe("打刻（§6 Enter）", () => {
    it("Enter は選択タスクを打刻へ渡す", () => {
      const { spies } = renderShortcuts({ selectedId: RUNNING.id });

      pressKey("Enter");

      expect(spies.punch).toHaveBeenCalledOnce();
      expect(spies.punch).toHaveBeenCalledWith(RUNNING);
    });

    it("完了タスクの選択中も同じく punch へ渡す（複製して開始 O-14 の判定は punch 側）", () => {
      const { spies } = renderShortcuts({ selectedId: COMPLETED.id });

      pressKey("Enter");

      expect(spies.punch).toHaveBeenCalledWith(COMPLETED);
    });

    it("選択がなければ打刻しない", () => {
      const { spies } = renderShortcuts({ selectedId: null });

      pressKey("Enter");

      expectNothingCalled(spies);
    });

    // ボタンにフォーカスが残っていると Enter でブラウザがそのボタンを押すため、
    // ここで打刻すると二重に発火する（打刻ボタンを押した直後など）
    it("ボタンにフォーカスがあるときの Enter は打刻しない（00_共通 §3）", () => {
      const { spies } = renderShortcuts();
      const { button } = renderFocusTargets();

      pressKey("Enter", {}, button);

      expectNothingCalled(spies);
    });

    // 除外するのは Enter だけ。打刻ボタンを押した直後はそのボタンにフォーカスが残るので、
    // ここで他のキーまで殺すと打刻ループの途中で選択移動・削除が効かなくなる
    it("ボタンにフォーカスがあっても Enter 以外のショートカットは効く", () => {
      const { state, spies } = renderStateful({ selectedId: RUNNING.id });
      const { button } = renderFocusTargets();

      pressKey("d", {}, button); // この時点の選択は RUNNING
      pressKey("j", {}, button);

      expect(spies.operate).toHaveBeenCalledWith(RUNNING, "delete");
      expect(state.current.selectedId).toBe(NEXT_UP.id);
    });
  });

  describe("行操作（§6 I / Y / D）", () => {
    it.each([
      ["i", "suspend"],
      ["y", "duplicate"],
      ["d", "delete"],
    ] as const)("%s は選択タスクに %s を要求する", (key, operation) => {
      const { spies } = renderShortcuts();

      pressKey(key);

      expect(spies.operate).toHaveBeenCalledOnce();
      expect(spies.operate).toHaveBeenCalledWith(RUNNING, operation);
    });

    it.each(["i", "y", "d"])("%s は選択がなければ何もしない", (key) => {
      const { spies } = renderShortcuts({ selectedId: null });

      pressKey(key);

      expectNothingCalled(spies);
    });

    // §6 の `I` 行は「中断（実行中タスクのみ）」だが、**その判定はここではなく呼び出し側**
    // （board）が持つ。ディスパッチャは状態を見ずに投げる、を意図として書いておく
    it("完了タスクを選択中でも I は suspend を要求する（実行中限定の判定は呼び出し側。§6）", () => {
      const { spies } = renderShortcuts({ selectedId: COMPLETED.id });

      pressKey("i");

      expect(spies.operate).toHaveBeenCalledExactlyOnceWith(COMPLETED, "suspend");
    });
  });

  describe("取り消し（§6 U・切り分けの正は O-13）", () => {
    it("取り消しの保留があればそれを最優先する（選択行の状態は見ない。O-13 / FB-37）", () => {
      const { spies } = renderShortcuts({ hasPendingUndo: true, selectedId: RUNNING.id });

      pressKey("u");

      expect(spies.undoPending).toHaveBeenCalledOnce();
      expect(spies.unstart).not.toHaveBeenCalled();
      expect(spies.uncomplete).not.toHaveBeenCalled();
    });

    it("保留がなく実行中タスクを選択中なら開始打刻を取り消す（O-13 / F-210）", () => {
      const { spies } = renderShortcuts({ selectedId: RUNNING.id });

      pressKey("u");

      expect(spies.unstart).toHaveBeenCalledOnce();
      expect(spies.unstart).toHaveBeenCalledWith(RUNNING);
      expect(spies.uncomplete).not.toHaveBeenCalled();
      expect(spies.undoPending).not.toHaveBeenCalled();
    });

    it("保留がなく完了タスクを選択中なら完了を取り消す（O-15 / F-212）", () => {
      const { spies } = renderShortcuts({ selectedId: COMPLETED.id });

      pressKey("u");

      expect(spies.uncomplete).toHaveBeenCalledOnce();
      expect(spies.uncomplete).toHaveBeenCalledWith(COMPLETED);
      expect(spies.unstart).not.toHaveBeenCalled();
    });

    it("保留がなく未実行タスクを選択中は何もしない（O-13）", () => {
      const { spies } = renderShortcuts({ selectedId: NEXT_UP.id });

      pressKey("u");

      expectNothingCalled(spies);
    });

    it("保留がなく選択もなければ何もしない", () => {
      const { spies } = renderShortcuts({ selectedId: null });

      pressKey("u");

      expectNothingCalled(spies);
    });
  });

  describe("並び替え（§6 Shift+J / Shift+K・O-6）", () => {
    it("Shift+J はタスクを1段下げる（選択行は動かさない）", () => {
      const { state, spies } = renderStateful({ selectedId: RUNNING.id });

      pressKey("J", { shiftKey: true });

      expect(spies.moveByStep).toHaveBeenCalledOnce();
      expect(spies.moveByStep).toHaveBeenCalledWith(1);
      expect(state.current.selectedId).toBe(RUNNING.id);
    });

    it("Shift+K はタスクを1段上げる", () => {
      const { state, spies } = renderStateful({ selectedId: RUNNING.id });

      pressKey("K", { shiftKey: true });

      expect(spies.moveByStep).toHaveBeenCalledWith(-1);
      expect(state.current.selectedId).toBe(RUNNING.id);
    });

    // 対象（移動するタスク）の確定は呼び出し側の責務。未選択のまま並べ替えたときに選択を
    // 現在地から確定させる規則は board 側にある（§5 / FB-50）ので、フックは選択の有無で止めない
    it("選択が無くても並び替えを要求する（対象の確定は呼び出し側の責務。§5 / FB-50）", () => {
      const { spies } = renderShortcuts({ selectedId: null });

      pressKey("J", { shiftKey: true });

      expect(spies.moveByStep).toHaveBeenCalledOnce();
      expect(spies.moveByStep).toHaveBeenCalledWith(1);
    });

    it("Shift なしの J / K は並び替えず選択行だけ動かす", () => {
      const { state, spies } = renderStateful({ selectedId: RUNNING.id });

      pressKey("j");

      expect(spies.moveByStep).not.toHaveBeenCalled();
      expect(state.current.selectedId).toBe(NEXT_UP.id);
    });
  });

  describe("日付移動（§6 Shift+H / Shift+L / T / G）", () => {
    it("Shift+H は前日へ移動する", () => {
      const { spies } = renderShortcuts({ date: "2026-03-01" });

      pressKey("H", { shiftKey: true });

      expect(spies.push).toHaveBeenCalledWith("/?date=2026-02-28");
    });

    it("Shift+L は翌日へ移動する", () => {
      const { spies } = renderShortcuts({ date: "2026-02-28" });

      pressKey("L", { shiftKey: true });

      expect(spies.push).toHaveBeenCalledWith("/?date=2026-03-01");
    });

    it("T は今日（日付クエリなし）へ戻る", () => {
      const { spies } = renderShortcuts({ date: "2026-02-28" });

      pressKey("t");

      expect(spies.push).toHaveBeenCalledWith("/");
    });

    it("G は datepicker を開く（§3.1）", () => {
      const { spies } = renderShortcuts();

      pressKey("g");

      expect(spies.openDatePicker).toHaveBeenCalledOnce();
      expect(spies.push).not.toHaveBeenCalled();
    });
  });

  describe("インライン編集の開始（§6 R / E / B / F / M / P / S）", () => {
    // 打刻時刻の修正は打刻済みの側だけ（§3.3）なので、全キーが通るのは完了タスクを選択中のとき
    it.each(EDIT_KEYS)("%s は選択行の %s の編集を開く", (key, field) => {
      const { spies } = renderShortcuts({ selectedId: COMPLETED.id });

      pressKey(key);

      expect(spies.setEditing).toHaveBeenCalledOnce();
      expect(spies.setEditing).toHaveBeenCalledWith({ taskId: COMPLETED.id, field });
    });

    it.each(EDIT_KEYS)("%s は選択がなければ編集を開かない", (key) => {
      const { spies } = renderShortcuts({ selectedId: null });

      pressKey(key);

      expectNothingCalled(spies);
    });

    // 打刻を見るのは B / F だけ。他の編集キーは打刻状態に依らず開く（ガードが広がっていないことの固定）
    it.each(NON_PUNCH_EDIT_KEYS)("%s は未実行タスクでも %s の編集を開く", (key, field) => {
      const { spies } = renderShortcuts({ selectedId: NEXT_UP.id });

      pressKey(key);

      expect(spies.setEditing).toHaveBeenCalledWith({ taskId: NEXT_UP.id, field });
    });

    // 打刻していない時刻には直すべき値が無い。編集状態にすると入力欄が描かれないまま
    // 全ショートカットが止まる（`editing !== null` で早期 return する）ので、開かせない
    it("B は未実行タスクでは開始時刻の編集を開かない（§3.3: 修正できるのは打刻済みの時刻だけ / FB-68）", () => {
      const { spies } = renderShortcuts({ selectedId: NEXT_UP.id });

      pressKey("b");

      expectNothingCalled(spies);
    });

    it.each(NO_ENDED_AT_SELECTIONS)(
      "F は%sタスクでは終了時刻の編集を開かない（§3.3: 修正できるのは打刻済みの時刻だけ）",
      (_label, selectedId) => {
        const { spies } = renderShortcuts({ selectedId });

        pressKey("f");

        expectNothingCalled(spies);
      }
    );

    it("B が開かないときは既定動作も止めない（00_共通 §3: 抑止は最小化）", () => {
      renderShortcuts({ selectedId: NEXT_UP.id });

      expect(pressDefaultPrevented("b")).toBe(false);
    });

    it.each(NO_ENDED_AT_SELECTIONS)(
      "F が%sタスクで開かないときは既定動作も止めない（00_共通 §3: 抑止は最小化）",
      (_label, selectedId) => {
        renderShortcuts({ selectedId });

        expect(pressDefaultPrevented("f")).toBe(false);
      }
    );

    it("実行中タスクでも開始時刻は開ける（打刻済みのため）", () => {
      const { spies } = renderShortcuts({ selectedId: RUNNING.id });

      pressKey("b");

      expect(spies.setEditing).toHaveBeenCalledWith({ taskId: RUNNING.id, field: "startedAt" });
    });
  });

  describe("クイック追加（§6 A）", () => {
    it("A はクイック追加欄へフォーカスする", () => {
      const { spies } = renderShortcuts();

      pressKey("a");

      expect(spies.focus).toHaveBeenCalledOnce();
    });

    it("クイック追加欄が無くても落ちず、既定動作は止めたままにする", () => {
      const { spies } = renderShortcuts({ quickAddRef: { current: null } });

      expect(pressDefaultPrevented("a")).toBe(true);
      expectNothingCalled(spies);
    });
  });

  describe("ショートカット一覧（§6 ?）", () => {
    it("? で一覧を表示する", () => {
      const { state } = renderStateful({ showHelp: false });

      pressKey("?", { shiftKey: true });

      expect(state.current.showHelp).toBe(true);
    });

    it("? をもう一度押すと閉じる（表示・非表示のトグル）", () => {
      const { state } = renderStateful({ showHelp: true });

      pressKey("?", { shiftKey: true });

      expect(state.current.showHelp).toBe(false);
    });

    // ? は Shift+/ で入力されるため、Shift 分岐（並び替え・日付移動）より先に処理する
    it("? は Shift 併用でも並び替え・日付移動に食われない", () => {
      const { state, spies } = renderStateful();

      pressKey("?", { shiftKey: true });

      expect(state.current.showHelp).toBe(true);
      expect(spies.moveByStep).not.toHaveBeenCalled();
      expect(spies.push).not.toHaveBeenCalled();
    });
  });

  // 表に載っているキーとディスパッチャが拾うキーが一致することを**両方向**で固定する
  // （畳めない理由と分担は `_lib/shortcuts.ts` 冒頭）
  describe("表（_lib/shortcuts.ts）とディスパッチャの結び付き", () => {
    // 打刻の要る B / F も通るよう完了タスクを選択して押す（§3.3）
    it.each(SHORTCUT_PRESSES)("表の %s は必ず何かを起こす", (key, init) => {
      const { spies } = renderShortcuts({ selectedId: COMPLETED.id });

      pressKey(key, init);

      expect(calledSpyNames(spies)).not.toEqual([]);
    });

    // 先送り（O-7）・ルーチン化（O-12）に割り当てが無いこと、Shift 分岐が J/K/H/L だけで
    // あることも、割り当て済みキーとの差集合として一緒に主張される。
    // **既定動作まで見る**——止める側の一覧（`PREVENT_DEFAULT_KEYS`）は表のキーしか並べないので、
    // ここで見ないと表外のキーを握り潰す実装を誰も咎めない（00_共通 §3: 抑止は最小化）
    it.each(SWEEP_STATES)("表に無いキーは %s でも何も起こさない", (_label, overrides) => {
      const { spies } = renderShortcuts(overrides);

      for (const { key, shiftKey } of UNASSIGNED_KEYS) {
        expect(pressKey(key, { shiftKey })).toBe(true);
      }

      expectNothingCalled(spies);
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
    // 止める側だけを列挙し、止めない側は §6 の全キーからの差集合で導く（一覧を二重に持たない）
    it("§6 の全キーを止める側・止めない側のどちらかに分類している", () => {
      // 止める側に §6 の一覧に無いキーを書くと、そのキーは下の表に載っても意味を持たない
      expect(SHORTCUT_PRESSES.map(([key]) => key)).toEqual(
        expect.arrayContaining([...PREVENT_DEFAULT_KEYS])
      );
      // 件数の一致は止める側の重複（同じキーの二重記載）を検出する。差集合は重複を吸収するため
      expect(KEEP_DEFAULT_KEYS.length + PREVENT_DEFAULT_KEYS.length).toBe(
        SHORTCUT_PRESSES.length
      );
    });

    // 押したキー自体が入力欄・編集欄へ入るのを防ぐ必要があるものだけ止める。
    // 編集キーは編集を開くときだけ止めるので、B / F も通る完了タスクを選択中で見る（§3.3）
    it.each(PREVENT_DEFAULT_KEYS)("%s は既定動作を止める", (key) => {
      renderShortcuts({ selectedId: COMPLETED.id });

      expect(pressDefaultPrevented(key)).toBe(true);
    });

    it.each(KEEP_DEFAULT_KEYS)("%s は既定動作を止めない", (key, init) => {
      renderShortcuts();

      expect(pressDefaultPrevented(key, init)).toBe(false);
    });

    it("編集キーでも選択がなければ既定動作を止めない", () => {
      renderShortcuts({ selectedId: null });

      expect(pressDefaultPrevented("r")).toBe(false);
    });
  });

  describe("リスナの登録", () => {
    it("再レンダリングしても1回の押下で1回しか呼ばれない（登録が重複しない）", () => {
      const { spies, rerender } = renderShortcuts();

      rerender();
      rerender();
      pressKey("Enter");

      expect(spies.punch).toHaveBeenCalledOnce();
    });

    it("再レンダリング後は最新の選択行に作用する", () => {
      const { spies, rerender } = renderShortcuts({ selectedId: RUNNING.id });

      rerender({ selectedId: NEXT_UP.id });
      pressKey("Enter");

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
