import { describe, expect, it } from "vitest";
import { currentTaskId, keepSelection, moveSelection } from "./selection";
import type { Task } from "./task";

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-19",
    name: `T${over.id}`,
    estimateMinutes: 30,
    sectionId: 1,
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

const startedAt = new Date("2026-07-19T08:00:00Z");
const endedAt = new Date("2026-07-19T08:30:00Z");

describe("currentTaskId（画面定義書01 §5: 現在地の規則）", () => {
  it("実行中タスクがあればそれを指す", () => {
    const tasks = [task({ id: 1, startedAt, endedAt }), task({ id: 2, startedAt }), task({ id: 3 })];
    expect(currentTaskId(tasks)).toBe(2);
  });

  it("実行中がなければ表示順で最初の未実行タスク", () => {
    const tasks = [task({ id: 1, startedAt, endedAt }), task({ id: 2 }), task({ id: 3 })];
    expect(currentTaskId(tasks)).toBe(2);
  });

  it("すべて完了なら現在地はない", () => {
    const tasks = [task({ id: 1, startedAt, endedAt })];
    expect(currentTaskId(tasks)).toBeNull();
  });

  it("タスクが0件なら現在地はない", () => {
    expect(currentTaskId([])).toBeNull();
  });
});

describe("moveSelection（画面定義書01 §6: J/K・↑↓ で選択移動）", () => {
  const tasks = [task({ id: 1 }), task({ id: 2 }), task({ id: 3 })];

  it("下へ1つ移動する", () => {
    expect(moveSelection(tasks, 1, 1)).toBe(2);
  });

  it("上へ1つ移動する", () => {
    expect(moveSelection(tasks, 3, -1)).toBe(2);
  });

  it("末尾で下へ移動しても止まる", () => {
    expect(moveSelection(tasks, 3, 1)).toBe(3);
  });

  it("先頭で上へ移動しても止まる", () => {
    expect(moveSelection(tasks, 1, -1)).toBe(1);
  });

  it("未選択から下へ移動すると先頭を選ぶ", () => {
    expect(moveSelection(tasks, null, 1)).toBe(1);
  });

  it("未選択から上へ移動すると末尾を選ぶ", () => {
    expect(moveSelection(tasks, null, -1)).toBe(3);
  });

  it("タスクが0件なら選択なし", () => {
    expect(moveSelection([], 1, 1)).toBeNull();
  });
});

describe("keepSelection（削除・日付移動の後も選択を保つ）", () => {
  it("選択中のタスクが残っていればそのまま", () => {
    const tasks = [task({ id: 1 }), task({ id: 2 })];
    expect(keepSelection(tasks, 2)).toBe(2);
  });

  it("選択中のタスクが消えたら現在地へ戻す", () => {
    const tasks = [task({ id: 1, startedAt }), task({ id: 3 })];
    expect(keepSelection(tasks, 99)).toBe(1);
  });

  it("未選択なら現在地を選ぶ", () => {
    const tasks = [task({ id: 1, startedAt, endedAt }), task({ id: 2 })];
    expect(keepSelection(tasks, null)).toBe(2);
  });
});
