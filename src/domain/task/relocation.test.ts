import { describe, expect, it } from "vitest";
import type { Section } from "../section/section";
import { planCarryOver, relocationOnStart, type Relocation } from "./relocation";
import type { Task } from "./task";

const morning: Section = { id: 1, name: "朝", startTime: "06:00", isArchived: false };
const forenoon: Section = { id: 2, name: "午前", startTime: "09:00", isArchived: false };
const afternoon: Section = { id: 3, name: "午後", startTime: "12:00", isArchived: false };
const sections = [morning, forenoon, afternoon];

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-20",
    name: `T${over.id}`,
    estimateMinutes: 30,
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

const started = new Date("2026-07-20T01:00:00Z"); // 実行中タスク用のダミー開始時刻
const completed = { startedAt: new Date("2026-07-20T00:00:00Z"), endedAt: new Date("2026-07-20T00:30:00Z") };

/** テストの都合で Relocation を tasks へ反映するヘルパー（冪等性の検証に使う） */
function applyRelocations(tasks: readonly Task[], relocations: readonly Relocation[]): Task[] {
  const byId = new Map(relocations.map((r) => [r.taskId, r]));
  return tasks.map((t) => {
    const r = byId.get(t.id);
    return r === undefined ? t : { ...t, sectionId: r.sectionId, sortOrder: r.sortOrder };
  });
}

describe("relocationOnStart（画面定義書01 §4.2-a: 開始したタスク自身の移動）", () => {
  it("未分類（section_id IS NULL）から開始時刻を含むセクションの末尾へ移る（FB-02）", () => {
    const t = task({ id: 1, sectionId: null });
    const result = relocationOnStart(t, [t], sections, "09:30");
    expect(result).toEqual({ taskId: 1, sectionId: forenoon.id, sortOrder: 1000 });
  });

  it("移動先セクションに既存タスクがあれば末尾（最大値+1000）に置く", () => {
    const t = task({ id: 1, sectionId: null });
    const sibling = task({ id: 2, sectionId: forenoon.id, sortOrder: 2500 });
    const result = relocationOnStart(t, [t, sibling], sections, "09:30");
    expect(result).toEqual({ taskId: 1, sectionId: forenoon.id, sortOrder: 3500 });
  });

  it("既に開始時刻を含むセクションにいる場合は null（移動不要）", () => {
    const t = task({ id: 1, sectionId: forenoon.id });
    const result = relocationOnStart(t, [t], sections, "09:30");
    expect(result).toBeNull();
  });

  it("開始時刻を含む有効セクションが無い場合は null", () => {
    const t = task({ id: 1, sectionId: null });
    const result = relocationOnStart(t, [t], [], "09:30");
    expect(result).toBeNull();
  });
});

describe("planCarryOver（画面定義書01 §4.2-b: 現在位置より前の未実行タスクの繰り下げ）", () => {
  it("対象が無ければ空配列", () => {
    const anchor = task({ id: 1, sectionId: forenoon.id, sortOrder: 1000 });
    const result = planCarryOver([anchor], sections, "10:00");
    expect(result).toEqual([]);
  });

  it("実行中タスクが無い場合: 過ぎたセクションの未実行タスクを現在セクションの先頭へ繰り下げる", () => {
    const overdue = task({ id: 1, sectionId: morning.id, sortOrder: 1000 });
    const anchor = task({ id: 2, sectionId: forenoon.id, sortOrder: 1000 });
    const later = task({ id: 3, sectionId: forenoon.id, sortOrder: 2000 });
    const untouched = task({ id: 4, sectionId: afternoon.id, sortOrder: 1000 });

    const result = planCarryOver([overdue, anchor, later, untouched], sections, "10:00");

    // 繰り下げ対象（id=1）だけを、現在セクションの先頭（id=2 の手前）へ間隔採番で差し込む。
    // 元からある id=2 / id=3 の sort_order は書き換えない（§4.2 の対象外）
    expect(result).toEqual([{ taskId: 1, sectionId: forenoon.id, sortOrder: 500 }]);
    expect(result.some((r) => r.taskId === 4)).toBe(false);
  });

  it("実行中タスクがある場合: その直後が現在位置になり、実行中タスク自身は動かない", () => {
    const running = task({ id: 1, sectionId: forenoon.id, sortOrder: 1000, startedAt: started });
    const overdue = task({ id: 2, sectionId: morning.id, sortOrder: 1000 });
    // 開始時に規則aで末尾へ移った running より前に残っていた同一セクションの未実行タスク
    const leftInSameSection = task({ id: 3, sectionId: forenoon.id, sortOrder: 500 });
    const untouched = task({ id: 4, sectionId: afternoon.id, sortOrder: 1000 });

    const result = planCarryOver([running, overdue, leftInSameSection, untouched], sections, "00:00");

    expect(result.find((r) => r.taskId === 1)).toBeUndefined(); // 実行中タスク自身は動かない
    expect(result.find((r) => r.taskId === 4)).toBeUndefined(); // 現在位置より後は対象外

    const overdueRelocation = result.find((r) => r.taskId === 2);
    const leftRelocation = result.find((r) => r.taskId === 3);
    expect(overdueRelocation?.sectionId).toBe(forenoon.id);
    expect(leftRelocation?.sectionId).toBe(forenoon.id);
    // 元の相対順序（過ぎたセクション→同一セクション内の残り）を保つ
    expect(overdueRelocation!.sortOrder).toBeLessThan(leftRelocation!.sortOrder);
  });

  it("未分類（section_id IS NULL）の未実行タスクは繰り下げない", () => {
    const unclassified = task({ id: 1, sectionId: null, sortOrder: 1000 });
    const anchor = task({ id: 2, sectionId: forenoon.id, sortOrder: 1000 });

    const result = planCarryOver([unclassified, anchor], sections, "10:00");

    expect(result).toEqual([]);
  });

  it("完了タスクは繰り下げ対象にならず、元の位置に留まる", () => {
    const doneInMorning = task({ id: 1, sectionId: morning.id, sortOrder: 500, ...completed });
    const overdue = task({ id: 2, sectionId: morning.id, sortOrder: 1000 });
    const anchor = task({ id: 3, sectionId: forenoon.id, sortOrder: 1000 });

    const result = planCarryOver([doneInMorning, overdue, anchor], sections, "10:00");

    expect(result.find((r) => r.taskId === 1)).toBeUndefined();
    expect(result.find((r) => r.taskId === 2)).toBeDefined();
  });

  it("複数件をまとめて繰り下げるときは元の相対順序を保つ", () => {
    const overdueA = task({ id: 1, sectionId: morning.id, sortOrder: 1000 });
    const overdueB = task({ id: 2, sectionId: morning.id, sortOrder: 2000 });
    const anchor = task({ id: 3, sectionId: forenoon.id, sortOrder: 1000 });

    const result = planCarryOver([overdueB, overdueA, anchor], sections, "10:00");

    const idsInOrder = result.filter((r) => r.taskId !== 3).map((r) => r.taskId);
    expect(idsInOrder).toEqual([1, 2]);
  });

  it("移動先セクションでは元からあるタスクより前に置かれる", () => {
    const overdue = task({ id: 1, sectionId: morning.id, sortOrder: 1000 });
    const anchor = task({ id: 2, sectionId: forenoon.id, sortOrder: 1000 });

    const result = planCarryOver([overdue, anchor], sections, "10:00");

    const overdueRelocation = result.find((r) => r.taskId === 1)!;
    // overdue は anchor より小さい sortOrder で割り込む。anchor 自身は動かさない
    expect(overdueRelocation.sectionId).toBe(forenoon.id);
    expect(overdueRelocation.sortOrder).toBeLessThan(anchor.sortOrder);
    expect(result.some((r) => r.taskId === 2)).toBe(false);
  });

  it("現在時刻を含む有効セクションが無い場合は空配列", () => {
    const overdue = task({ id: 1, sectionId: morning.id, sortOrder: 1000 });
    const result = planCarryOver([overdue], [], "10:00");
    expect(result).toEqual([]);
  });

  it("冪等性: 繰り下げ結果を反映した後に再度呼ぶと空配列になる（デイリー表示のたびに走るため）", () => {
    const overdue = task({ id: 1, sectionId: morning.id, sortOrder: 1000 });
    const anchor = task({ id: 2, sectionId: forenoon.id, sortOrder: 1000 });
    const later = task({ id: 3, sectionId: forenoon.id, sortOrder: 2000 });
    const tasks = [overdue, anchor, later];

    const first = planCarryOver(tasks, sections, "10:00");
    expect(first.length).toBeGreaterThan(0);

    const applied = applyRelocations(tasks, first);
    const second = planCarryOver(applied, sections, "10:00");
    expect(second).toEqual([]);
  });

  it("冪等性（実行中タスクがある場合）: 繰り下げ結果を反映した後に再度呼ぶと空配列になる", () => {
    const running = task({ id: 1, sectionId: forenoon.id, sortOrder: 1000, startedAt: started });
    const overdue = task({ id: 2, sectionId: morning.id, sortOrder: 1000 });
    const leftInSameSection = task({ id: 3, sectionId: forenoon.id, sortOrder: 500 });
    const tasks = [running, overdue, leftInSameSection];

    const first = planCarryOver(tasks, sections, "00:00");
    expect(first.length).toBeGreaterThan(0);

    const applied = applyRelocations(tasks, first);
    const second = planCarryOver(applied, sections, "00:00");
    expect(second).toEqual([]);
  });

  it("画面定義書01 §4.2: 対象外の行（完了・実行中）の sort_order は書き換えない", () => {
    // 移動先セクションの先頭に完了タスクがあり、その sort_order は 1000 刻みに乗っていない
    const done = task({ id: 1, sectionId: forenoon.id, sortOrder: 100, ...completed });
    const planned = task({ id: 2, sectionId: forenoon.id, sortOrder: 5000 });
    const overdue = task({ id: 3, sectionId: morning.id, sortOrder: 1000 });

    const result = planCarryOver([done, planned, overdue], sections, "10:00");

    // 動くのは繰り下げ対象だけ。完了タスクと元からある未実行タスクは触らない
    expect(result.map((r) => r.taskId)).toEqual([3]);
    const moved = result[0];
    expect(moved.sectionId).toBe(forenoon.id);
    expect(moved.sortOrder).toBeGreaterThan(done.sortOrder);
    expect(moved.sortOrder).toBeLessThan(planned.sortOrder);
  });

  it("データモデル定義書 §3.5: 中間値が尽きたら移動先セクションを振り直す", () => {
    // 完了 100 と未実行 101 の間には隙間がないので、セクション全体を1000刻みへ戻す
    const done = task({ id: 1, sectionId: forenoon.id, sortOrder: 100, ...completed });
    const planned = task({ id: 2, sectionId: forenoon.id, sortOrder: 101 });
    const overdue = task({ id: 3, sectionId: morning.id, sortOrder: 1000 });

    const result = planCarryOver([done, planned, overdue], sections, "10:00");

    expect(result).toEqual([
      { taskId: 1, sectionId: forenoon.id, sortOrder: 1000 },
      { taskId: 3, sectionId: forenoon.id, sortOrder: 2000 },
      { taskId: 2, sectionId: forenoon.id, sortOrder: 3000 },
    ]);
  });

  it("引数の配列を破壊的に変更しない", () => {
    const overdue = task({ id: 1, sectionId: morning.id, sortOrder: 1000 });
    const anchor = task({ id: 2, sectionId: forenoon.id, sortOrder: 1000 });
    const tasks = [overdue, anchor];
    const snapshot = tasks.map((t) => ({ ...t }));

    planCarryOver(tasks, sections, "10:00");

    expect(tasks).toEqual(snapshot);
  });
});
