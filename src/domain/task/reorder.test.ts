import { describe, expect, it } from "vitest";
import { moveTaskByStep, reorderTask, stepMoveDestination } from "./reorder";
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

  it("タスク0件のセクションへも移動できる（空セクションも表示されるため）", () => {
    // セクション2（午前）にタスクがない状態で、セクション1の末尾から下へ動かす
    const r = moveTaskByStep(tasks, 3, 1, SECTION_ORDER);
    expect(r.ok && [r.value.sectionId, r.value.sortOrder]).toEqual([2, 1000]);
  });

  it("空セクションを跨いでも1つずつ移動する（一気に飛ばさない）", () => {
    const inEmptyNeighbor = [task({ id: 1, sectionId: 1, sortOrder: 1000 })];
    const first = moveTaskByStep(inEmptyNeighbor, 1, 1, SECTION_ORDER);
    expect(first.ok && first.value.sectionId).toBe(2); // 朝 → 午前（空）
  });

  it("リスト全体の先頭・末尾では動かさない", () => {
    const first = moveTaskByStep(tasks, 1, -1, [1, 2]);
    expect(first.ok && first.value.sortOrder).toBe(1000); // 変化なし

    const last = moveTaskByStep(tasks, 3, 1, [1]);
    expect(last.ok && last.value.sortOrder).toBe(3000); // 変化なし
  });
});

describe("stepMoveDestination（画面定義書01 §6: Shift+J/K の移動先。採番せず位置だけ返す）", () => {
  const tasks = [
    task({ id: 1, sortOrder: 1000 }),
    task({ id: 2, sortOrder: 2000 }),
    task({ id: 3, sortOrder: 3000 }),
  ];

  it("グループ内で下へ1つは同一セクションの次の位置を返す", () => {
    expect(stepMoveDestination(tasks, 1, 1, SECTION_ORDER)).toEqual({ sectionId: 1, index: 1 });
  });

  it("グループ内で上へ1つは同一セクションの前の位置を返す", () => {
    expect(stepMoveDestination(tasks, 3, -1, SECTION_ORDER)).toEqual({ sectionId: 1, index: 1 });
  });

  it("グループ末尾から下へは次セクションの先頭（index 0）を返す", () => {
    const withOther = [...tasks, task({ id: 4, sectionId: 2, sortOrder: 5000 })];
    expect(stepMoveDestination(withOther, 3, 1, SECTION_ORDER)).toEqual({ sectionId: 2, index: 0 });
  });

  it("グループ先頭から上へは前セクションの末尾（要素数）を返す", () => {
    // 未分類に2件置き、末尾＝length（index 2）を返すことを固定する
    const withUnclassified = [
      ...tasks,
      task({ id: 5, sectionId: null, sortOrder: 1000 }),
      task({ id: 6, sectionId: null, sortOrder: 2000 }),
    ];
    expect(stepMoveDestination(withUnclassified, 1, -1, SECTION_ORDER)).toEqual({
      sectionId: null,
      index: 2, // 未分類セクションの末尾（2件あるので index 2）
    });
  });

  it("未分類のタスクを下へ動かすと次セクションの先頭へ渡る（未分類起点の跨ぎ）", () => {
    const fromUnclassified = [task({ id: 5, sectionId: null, sortOrder: 1000 }), ...tasks];
    expect(stepMoveDestination(fromUnclassified, 5, 1, SECTION_ORDER)).toEqual({
      sectionId: 1,
      index: 0,
    });
  });

  it("タスク0件のセクションへも先頭（index 0）を返す", () => {
    expect(stepMoveDestination(tasks, 3, 1, SECTION_ORDER)).toEqual({ sectionId: 2, index: 0 });
  });

  it("リスト全体の端では null（移動しない）", () => {
    expect(stepMoveDestination(tasks, 1, -1, [1, 2])).toBeNull(); // 先頭で上
    expect(stepMoveDestination(tasks, 3, 1, [1])).toBeNull(); // 末尾で下
  });

  it("存在しないタスクは null", () => {
    expect(stepMoveDestination(tasks, 99, 1, SECTION_ORDER)).toBeNull();
  });
});
