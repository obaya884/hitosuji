// sort_order の間隔採番（データモデル定義書 §3.5）
// 連番ではなく1000刻み。途中挿入は前後の中間値を振り、中間値が尽きたときだけ振り直す
import { err, ok, type Result } from "../shared/result";

export const SORT_ORDER_STEP = 1000;

/** 末尾追加・ルーチン展開: セクション内最大値 +1000 */
export function appendSortOrder(siblingSortOrders: readonly number[]): number {
  if (siblingSortOrders.length === 0) return SORT_ORDER_STEP;
  return Math.max(...siblingSortOrders) + SORT_ORDER_STEP;
}

/**
 * 途中挿入・並び替え: 前後の中間値。
 * 前後の差が1で中間値が取れないときは振り直しが必要（`needs_renumber`）
 */
export function insertBetweenSortOrder(
  before: number | null,
  after: number | null
): Result<number, "needs_renumber"> {
  if (before === null && after === null) return ok(SORT_ORDER_STEP);
  if (before === null) return ok(after! - SORT_ORDER_STEP);
  if (after === null) return ok(before + SORT_ORDER_STEP);

  const middle = Math.floor((before + after) / 2);
  if (middle === before || middle === after) return err("needs_renumber");
  return ok(middle);
}

/** 振り直し: 現在の並び順を保ったまま1000刻みへ戻す */
export function renumberSortOrders(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * SORT_ORDER_STEP);
}
