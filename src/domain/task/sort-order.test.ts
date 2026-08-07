import { describe, expect, it } from "vitest";
import {
  appendSortOrder,
  placeNewPair,
  placeSortOrder,
  renumberSortOrders,
  seatsBetween,
  sortedBySortOrder,
  tasksInSection,
} from "./sort-order";
import { task } from "./testing/task";

describe("sortedBySortOrder（データモデル定義書 §3.5: 並び順は sort_order 昇順）", () => {
  it("sort_order の昇順に並べる", () => {
    const tasks = [
      task({ id: 1, sortOrder: 3000 }),
      task({ id: 2, sortOrder: 1000 }),
      task({ id: 3, sortOrder: 2000 }),
    ];

    expect(sortedBySortOrder(tasks).map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("負値も昇順に並ぶ（先頭挿入を繰り返すと 0・-1000 が現れる）", () => {
    const tasks = [
      task({ id: 1, sortOrder: 1000 }),
      task({ id: 2, sortOrder: -1000 }),
      task({ id: 3, sortOrder: 0 }),
    ];

    expect(sortedBySortOrder(tasks).map((t) => t.id)).toEqual([2, 3, 1]);
  });

  it("引数の配列を破壊的に変更しない", () => {
    const tasks = [task({ id: 1, sortOrder: 2000 }), task({ id: 2, sortOrder: 1000 })];

    sortedBySortOrder(tasks);

    expect(tasks.map((t) => t.id)).toEqual([1, 2]);
  });
});

describe("tasksInSection（データモデル定義書 §3.5: 同一セクションを sort_order 昇順で取り出す）", () => {
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

  it("該当0件なら空配列（タスクが1件も無いセクションも画面には出る）", () => {
    expect(tasksInSection(tasks, 99)).toEqual([]);
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

  it("前後の差が2なら中間値が取れる（振り直しの閾値は差が1のときだけ。§3.5）", () => {
    const pair = [task({ id: 1, sortOrder: 1000 }), task({ id: 2, sortOrder: 1002 })];

    expect(placeSortOrder(pair, 1)).toEqual({ sortOrder: 1001, renumber: [] });
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

    it("前後が同値でも振り直す（§4.7: sort_order にユニーク制約は無く同値が実在しうる）", () => {
      const tied = [task({ id: 1, sortOrder: 1000 }), task({ id: 2, sortOrder: 1000 })];
      const placed = placeSortOrder(tied, 1);

      expect(placed.sortOrder).toBe(2000);
      expect(placed.renumber).toEqual([
        { taskId: 1, sortOrder: 1000 },
        { taskId: 2, sortOrder: 3000 },
      ]);
    });
  });
});

describe("seatsBetween（データモデル定義書 §3.5: 前後の間に等間隔の席を取る）", () => {
  it("後ろが無ければ末尾なので1000刻みで続ける", () => {
    expect(seatsBetween(3000, null, 2)).toEqual({ ok: true, value: [4000, 5000] });
    expect(seatsBetween(null, null, 1)).toEqual({ ok: true, value: [1000] });
  });

  it("前後の間を席数+1で等分する", () => {
    expect(seatsBetween(1000, 4000, 2)).toEqual({ ok: true, value: [2000, 3000] });
    expect(seatsBetween(1000, 3000, 1)).toEqual({ ok: true, value: [2000] });
  });

  it("前が無いときは 0 を起点に等分する（後続より前に必ず収まる）", () => {
    expect(seatsBetween(null, 3000, 2)).toEqual({ ok: true, value: [1000, 2000] });
  });

  it("隙間が席数に足りなければ needs_renumber", () => {
    expect(seatsBetween(1000, 1002, 2)).toEqual({ ok: false, error: "needs_renumber" });
    // 席が1つなら同じ隙間でも収まる
    expect(seatsBetween(1000, 1002, 1)).toEqual({ ok: true, value: [1001] });
  });
});

describe("placeNewPair（データモデル定義書 §3.5 / §4.6: 新規2行を連続して差し込む採番）", () => {
  it("空のグループへは 1000・2000 を振る", () => {
    expect(placeNewPair([], 0)).toEqual({ first: 1000, second: 2000, renumber: [] });
  });

  it("末尾へ差し込むときは最後の値から1000刻みで続ける", () => {
    const siblings = [task({ id: 1, sortOrder: 3000 })];
    expect(placeNewPair(siblings, 1)).toEqual({ first: 4000, second: 5000, renumber: [] });
  });

  it("前後の間を3等分して2つの席を取る（既存行と重ならない）", () => {
    const siblings = [task({ id: 1, sortOrder: 1000 }), task({ id: 2, sortOrder: 4000 })];
    expect(placeNewPair(siblings, 1)).toEqual({ first: 2000, second: 3000, renumber: [] });
  });

  it("先頭へ差し込むときも後続より前に2つ収める", () => {
    const siblings = [task({ id: 1, sortOrder: 3000 })];
    expect(placeNewPair(siblings, 0)).toEqual({ first: 1000, second: 2000, renumber: [] });
  });

  it("前後の差が3なら2席が取れる（振り直しに落ちる境界の内側）", () => {
    const siblings = [task({ id: 1, sortOrder: 1000 }), task({ id: 2, sortOrder: 1003 })];
    expect(placeNewPair(siblings, 1)).toEqual({ first: 1001, second: 1002, renumber: [] });
  });

  it("先頭へ差し込むときに席が取れなければ振り直す", () => {
    const siblings = [task({ id: 1, sortOrder: 2 })];
    expect(placeNewPair(siblings, 0)).toEqual({
      first: 1000,
      second: 2000,
      renumber: [{ taskId: 1, sortOrder: 3000 }],
    });
  });

  it("2行分の隙間が無ければ、挿入後の並びを1000刻みへ振り直す", () => {
    const siblings = [
      task({ id: 1, sortOrder: 1000 }),
      task({ id: 2, sortOrder: 1002 }),
      task({ id: 3, sortOrder: 5000 }),
    ];

    expect(placeNewPair(siblings, 1)).toEqual({
      first: 2000,
      second: 3000,
      renumber: [
        { taskId: 1, sortOrder: 1000 },
        { taskId: 2, sortOrder: 4000 },
        { taskId: 3, sortOrder: 5000 },
      ],
    });
  });

  it("範囲外の index は端へ丸める", () => {
    const siblings = [task({ id: 1, sortOrder: 3000 })];
    expect(placeNewPair(siblings, 99)).toEqual({ first: 4000, second: 5000, renumber: [] });
    expect(placeNewPair(siblings, -1)).toEqual({ first: 1000, second: 2000, renumber: [] });
  });
});

describe("renumberSortOrders（中間値が尽きたときの振り直し）", () => {
  it("並び順を保ったまま1000刻みへ戻す", () => {
    expect(renumberSortOrders(3)).toEqual([1000, 2000, 3000]);
    expect(renumberSortOrders(0)).toEqual([]);
  });
});
