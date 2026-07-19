import { describe, expect, it } from "vitest";
import { moveTaskByStep, reorderTask } from "./reorder";
import type { Task } from "./task";

function task(over: Partial<Task> & { id: number }): Task {
  return {
    taskDate: "2026-07-19",
    name: `T${over.id}`,
    estimateMinutes: 0,
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

// 未分類を先頭にしたセクション表示順
const SECTION_ORDER = [null, 1, 2] as const;

describe("reorderTask（画面定義書01 O-6 / データモデル定義書 §3.5: 中間値で採番）", () => {
  const tasks = [
    task({ id: 1, sortOrder: 1000 }),
    task({ id: 2, sortOrder: 2000 }),
    task({ id: 3, sortOrder: 3000 }),
  ];

  it("先頭へ移動すると先頭タスクより小さい値になる", () => {
    const r = reorderTask(tasks, 3, { sectionId: 1, index: 0 });
    expect(r).toEqual({
      ok: true,
      value: { taskId: 3, sectionId: 1, sortOrder: 0, renumber: null },
    });
  });

  it("末尾へ移動すると末尾タスクより大きい値になる", () => {
    const r = reorderTask(tasks, 1, { sectionId: 1, index: 2 });
    expect(r.ok && r.value.sortOrder).toBe(4000);
  });

  it("途中へ移動すると前後の中間値になる", () => {
    const r = reorderTask(tasks, 1, { sectionId: 1, index: 1 });
    expect(r.ok && r.value.sortOrder).toBe(2500); // 2000 と 3000 の中間
  });

  it("セクションをまたぐ移動では section_id も変わる", () => {
    const withOther = [...tasks, task({ id: 4, sectionId: 2, sortOrder: 5000 })];
    const r = reorderTask(withOther, 1, { sectionId: 2, index: 1 });
    expect(r.ok && [r.value.sectionId, r.value.sortOrder]).toEqual([2, 6000]);
  });

  it("空のセクションへ移動できる", () => {
    const r = reorderTask(tasks, 1, { sectionId: 2, index: 0 });
    expect(r.ok && [r.value.sectionId, r.value.sortOrder]).toEqual([2, 1000]);
  });

  it("未分類（section_id なし）へも移動できる", () => {
    const r = reorderTask(tasks, 1, { sectionId: null, index: 0 });
    expect(r.ok && r.value.sectionId).toBeNull();
  });

  it("中間値が尽きたらグループ全体を1000刻みで振り直す", () => {
    const dense = [
      task({ id: 1, sortOrder: 1000 }),
      task({ id: 2, sortOrder: 1001 }),
      task({ id: 3, sortOrder: 3000 }),
    ];
    const r = reorderTask(dense, 3, { sectionId: 1, index: 1 }); // 1000 と 1001 の間

    expect(r.ok && r.value.sortOrder).toBe(2000);
    expect(r.ok && r.value.renumber).toEqual([
      { taskId: 1, sortOrder: 1000 },
      { taskId: 3, sortOrder: 2000 },
      { taskId: 2, sortOrder: 3000 },
    ]);
  });

  it("存在しないタスクはエラー", () => {
    expect(reorderTask(tasks, 99, { sectionId: 1, index: 0 })).toEqual({
      ok: false,
      error: "task_not_found",
    });
  });
});

describe("moveTaskByStep（画面定義書01 §6: Shift+J/K で1つずつ移動）", () => {
  const tasks = [
    task({ id: 1, sortOrder: 1000 }),
    task({ id: 2, sortOrder: 2000 }),
    task({ id: 3, sortOrder: 3000 }),
  ];

  it("下へ1つ動かすと次のタスクと入れ替わる", () => {
    const r = moveTaskByStep(tasks, 1, 1, SECTION_ORDER);
    expect(r.ok && r.value.sortOrder).toBe(2500); // 2000 と 3000 の中間
  });

  it("上へ1つ動かすと前のタスクと入れ替わる", () => {
    const r = moveTaskByStep(tasks, 3, -1, SECTION_ORDER);
    expect(r.ok && r.value.sortOrder).toBe(1500); // 1000 と 2000 の中間
  });

  it("グループ末尾から下へ動かすと次のセクションの先頭に入る", () => {
    const withOther = [...tasks, task({ id: 4, sectionId: 2, sortOrder: 5000 })];
    const r = moveTaskByStep(withOther, 3, 1, SECTION_ORDER);
    expect(r.ok && [r.value.sectionId, r.value.sortOrder]).toEqual([2, 4000]);
  });

  it("グループ先頭から上へ動かすと前のセクションの末尾に入る", () => {
    const withUnclassified = [...tasks, task({ id: 5, sectionId: null, sortOrder: 1000 })];
    const r = moveTaskByStep(withUnclassified, 1, -1, SECTION_ORDER);
    expect(r.ok && [r.value.sectionId, r.value.sortOrder]).toEqual([null, 2000]);
  });

  it("リスト全体の先頭・末尾では動かさない", () => {
    const first = moveTaskByStep(tasks, 1, -1, [1, 2]);
    expect(first.ok && first.value.sortOrder).toBe(1000); // 変化なし

    const last = moveTaskByStep(tasks, 3, 1, [1]);
    expect(last.ok && last.value.sortOrder).toBe(3000); // 変化なし
  });
});
