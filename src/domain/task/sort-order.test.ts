import { describe, expect, it } from "vitest";
import {
  appendSortOrder,
  insertBetweenSortOrder,
  renumberSortOrders,
  SORT_ORDER_STEP,
} from "./sort-order";

describe("appendSortOrder（データモデル定義書 §3.5: 末尾追加は最大値+1000）", () => {
  it("同一グループが空なら 1000 から始まる", () => {
    expect(appendSortOrder([])).toBe(1000);
  });

  it("最大値に1000を足す（並びが飛んでいても最大値基準）", () => {
    expect(appendSortOrder([1000, 3000, 2000])).toBe(4000);
  });
});

describe("insertBetweenSortOrder（データモデル定義書 §3.5: 途中挿入は前後の中間値）", () => {
  it("前後の中間値を返す", () => {
    expect(insertBetweenSortOrder(1000, 2000)).toEqual({ ok: true, value: 1500 });
  });

  it("先頭へ挿入するときは後続の値から1000引く", () => {
    expect(insertBetweenSortOrder(null, 1000)).toEqual({ ok: true, value: 0 });
  });

  it("末尾へ挿入するときは直前の値に1000足す", () => {
    expect(insertBetweenSortOrder(2000, null)).toEqual({ ok: true, value: 3000 });
  });

  it("空のグループへの挿入は 1000", () => {
    expect(insertBetweenSortOrder(null, null)).toEqual({ ok: true, value: SORT_ORDER_STEP });
  });

  it("前後の差が1で中間値が取れないときは振り直しを要求する", () => {
    expect(insertBetweenSortOrder(1000, 1001)).toEqual({ ok: false, error: "needs_renumber" });
  });
});

describe("renumberSortOrders（中間値が尽きたときの振り直し）", () => {
  it("並び順を保ったまま1000刻みへ戻す", () => {
    expect(renumberSortOrders(3)).toEqual([1000, 2000, 3000]);
    expect(renumberSortOrders(0)).toEqual([]);
  });
});
