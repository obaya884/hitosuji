import { describe, expect, it } from "vitest";
import { placeNewTask } from "./placement";
import { task } from "./testing/task";

describe("placeNewTask（データモデル定義書 §3.5: 挿入位置の採番）", () => {
  const group = [
    task({ id: 1, sortOrder: 1000 }),
    task({ id: 2, sortOrder: 2000 }),
    task({ id: 3, sortOrder: 3000 }),
  ];

  it("先頭へ挿入すると先頭タスクより小さい値になる", () => {
    expect(placeNewTask(group, 1, 0)).toEqual({ sectionId: 1, sortOrder: 0, renumber: null });
  });

  it("途中へ挿入すると前後の中間値になる", () => {
    expect(placeNewTask(group, 1, 1).sortOrder).toBe(1500);
  });

  it("末尾へ挿入すると末尾タスクより大きい値になる", () => {
    expect(placeNewTask(group, 1, 3).sortOrder).toBe(4000);
  });

  it("空のグループへの挿入は 1000", () => {
    expect(placeNewTask([], null, 0)).toEqual({
      sectionId: null,
      sortOrder: 1000,
      renumber: null,
    });
  });

  it("範囲外のインデックスは端に丸める", () => {
    expect(placeNewTask(group, 1, 99).sortOrder).toBe(4000);
    expect(placeNewTask(group, 1, -5).sortOrder).toBe(0);
  });

  it("中間値が尽きたら挿入後の並びを1000刻みで振り直す", () => {
    const dense = [
      task({ id: 1, sortOrder: 1000 }),
      task({ id: 2, sortOrder: 1001 }),
      task({ id: 3, sortOrder: 5000 }),
    ];
    // 1000 と 1001 の間へ挿入する
    const placement = placeNewTask(dense, 1, 1);

    expect(placement.sortOrder).toBe(2000);
    expect(placement.renumber).toEqual([
      { taskId: 1, sortOrder: 1000 },
      { taskId: 2, sortOrder: 3000 },
      { taskId: 3, sortOrder: 4000 },
    ]);
  });

  it("振り直し後も挿入位置の前後関係が保たれる", () => {
    const dense = [task({ id: 1, sortOrder: 1000 }), task({ id: 2, sortOrder: 1001 })];
    const placement = placeNewTask(dense, 1, 1);

    const after = [
      ...(placement.renumber ?? []).map((r) => ({ id: r.taskId, sortOrder: r.sortOrder })),
      { id: 0, sortOrder: placement.sortOrder },
    ].sort((a, b) => a.sortOrder - b.sortOrder);

    expect(after.map((t) => t.id)).toEqual([1, 0, 2]);
  });
});
