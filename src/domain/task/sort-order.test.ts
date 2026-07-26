import { describe, expect, it } from "vitest";
import {
  appendSortOrder,
  bySortOrder,
  placeSortOrder,
  renumberSortOrders,
  tasksInSection,
} from "./sort-order";
import { task } from "./testing/task";

describe("bySortOrder（データモデル定義書 §3.5: 並び順は sort_order 昇順）", () => {
  it("sort_order の昇順に並べる", () => {
    const tasks = [
      task({ id: 1, sortOrder: 3000 }),
      task({ id: 2, sortOrder: 1000 }),
      task({ id: 3, sortOrder: 2000 }),
    ];

    expect(bySortOrder(tasks).map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("引数の配列を破壊的に変更しない", () => {
    const tasks = [task({ id: 1, sortOrder: 2000 }), task({ id: 2, sortOrder: 1000 })];

    bySortOrder(tasks);

    expect(tasks.map((t) => t.id)).toEqual([1, 2]);
  });
});

describe("tasksInSection（同一セクションを sort_order 昇順で取り出す）", () => {
  const tasks = [
    task({ id: 1, sectionId: 1, sortOrder: 2000 }),
    task({ id: 2, sectionId: null, sortOrder: 1000 }),
    task({ id: 3, sectionId: 1, sortOrder: 1000 }),
  ];

  it("指定セクションのタスクだけを昇順で返す", () => {
    expect(tasksInSection(tasks, 1).map((t) => t.id)).toEqual([3, 1]);
  });

  it("null は未分類（インボックス）を指す", () => {
    expect(tasksInSection(tasks, null).map((t) => t.id)).toEqual([2]);
  });
});

describe("appendSortOrder（データモデル定義書 §3.5: 末尾追加は最大値+1000）", () => {
  it("同一グループが空なら 1000 から始まる", () => {
    expect(appendSortOrder([])).toBe(1000);
  });

  it("最大値に1000を足す（並びが飛んでいても最大値基準）", () => {
    expect(appendSortOrder([1000, 3000, 2000])).toBe(4000);
  });
});

describe("placeSortOrder（データモデル定義書 §3.5: 挿入位置の採番）", () => {
  const group = [
    task({ id: 1, sortOrder: 1000 }),
    task({ id: 2, sortOrder: 2000 }),
    task({ id: 3, sortOrder: 3000 }),
  ];

  it("途中へ挿入すると前後の中間値になる", () => {
    expect(placeSortOrder(group, 1)).toEqual({ sortOrder: 1500, renumber: [] });
  });

  it("先頭へ挿入すると後続の値から1000引く", () => {
    expect(placeSortOrder(group, 0)).toEqual({ sortOrder: 0, renumber: [] });
  });

  it("末尾へ挿入すると直前の値に1000足す", () => {
    expect(placeSortOrder(group, 3)).toEqual({ sortOrder: 4000, renumber: [] });
  });

  it("空のグループへの挿入は 1000", () => {
    expect(placeSortOrder([], 0)).toEqual({ sortOrder: 1000, renumber: [] });
  });

  it("範囲外のインデックスは端に丸める", () => {
    expect(placeSortOrder(group, 99).sortOrder).toBe(4000);
    expect(placeSortOrder(group, -5).sortOrder).toBe(0);
  });

  describe("中間値が尽きたとき（前後の差が1）", () => {
    const dense = [
      task({ id: 1, sortOrder: 1000 }),
      task({ id: 2, sortOrder: 1001 }),
      task({ id: 3, sortOrder: 5000 }),
    ];

    it("新規作成（自身は id が無い）なら既存タスクだけを1000刻みで振り直す", () => {
      // 1000 と 1001 の間へ挿入する
      const placed = placeSortOrder(dense, 1);

      expect(placed.sortOrder).toBe(2000);
      expect(placed.renumber).toEqual([
        { taskId: 1, sortOrder: 1000 },
        { taskId: 2, sortOrder: 3000 },
        { taskId: 3, sortOrder: 4000 },
      ]);
    });

    it("既存タスクの移動なら自身も挿入後の位置で振り直しに含める", () => {
      const moving = task({ id: 9, sortOrder: 9000 });
      const placed = placeSortOrder(dense, 1, moving);

      expect(placed.sortOrder).toBe(2000);
      expect(placed.renumber).toEqual([
        { taskId: 1, sortOrder: 1000 },
        { taskId: 9, sortOrder: 2000 },
        { taskId: 2, sortOrder: 3000 },
        { taskId: 3, sortOrder: 4000 },
      ]);
    });

    it("振り直し後も挿入位置の前後関係が保たれる", () => {
      const pair = [task({ id: 1, sortOrder: 1000 }), task({ id: 2, sortOrder: 1001 })];
      const placed = placeSortOrder(pair, 1);

      const after = [
        ...placed.renumber.map((r) => ({ id: r.taskId, sortOrder: r.sortOrder })),
        { id: 0, sortOrder: placed.sortOrder },
      ].sort((a, b) => a.sortOrder - b.sortOrder);

      expect(after.map((t) => t.id)).toEqual([1, 0, 2]);
    });

    it("末尾・先頭への挿入では起きない（前後どちらかが無ければ ±1000 で足りる）", () => {
      expect(placeSortOrder(dense, 0).renumber).toEqual([]);
      expect(placeSortOrder(dense, 3).renumber).toEqual([]);
    });
  });
});

describe("renumberSortOrders（中間値が尽きたときの振り直し）", () => {
  it("並び順を保ったまま1000刻みへ戻す", () => {
    expect(renumberSortOrders(3)).toEqual([1000, 2000, 3000]);
    expect(renumberSortOrders(0)).toEqual([]);
  });
});
