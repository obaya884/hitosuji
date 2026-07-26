// sort_order の採番と並び順（データモデル定義書 §3.5）
// 連番ではなく1000刻み。途中挿入は前後の中間値を振り、中間値が尽きたときだけ振り直す
import { err, ok, type Result } from "../shared/result";
import type { Task, TaskId } from "./task";

export const SORT_ORDER_STEP = 1000;

/**
 * 採番の振り直し。挿入・移動と同じトランザクションで反映する（§3.5）。
 * **空配列＝振り直しなし**（「なにもしない」の表し方はこの1通りだけ）
 */
export type Renumber = readonly Readonly<{ taskId: TaskId; sortOrder: number }>[];

/** 挿入位置の採番（`placeSortOrder` の結果） */
export type SortOrderPlacement = Readonly<{
  /** 挿入するタスク自身の sort_order */
  sortOrder: number;
  /** 中間値が尽きたときの同一グループの振り直し（空配列＝振り直しなし） */
  renumber: Renumber;
}>;

/** 同一グループのタスクを sort_order 昇順に並べる（表示順の第2キー。§3.5） */
export function bySortOrder(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** 指定セクション（null = 未分類）のタスクを sort_order 昇順で取り出す（§3.5） */
export function tasksInSection(tasks: readonly Task[], sectionId: number | null): Task[] {
  return bySortOrder(tasks.filter((t) => t.sectionId === sectionId));
}

/** 末尾追加・ルーチン展開: セクション内最大値 +1000 */
export function appendSortOrder(siblingSortOrders: readonly number[]): number {
  if (siblingSortOrders.length === 0) return SORT_ORDER_STEP;
  return Math.max(...siblingSortOrders) + SORT_ORDER_STEP;
}

/**
 * 挿入位置から採番と（必要なら）振り直しを求める（§3.5）。
 * 前後の中間値を振り、中間値が尽きたときだけ挿入後の並びを1000刻みへ振り直す。
 * 新規作成・並び替え・自動セクション移動のすべてがこの1関数を通る
 */
export function placeSortOrder(
  /** 挿入対象を除いた、同一グループの sort_order 昇順の並び */
  siblings: readonly Task[],
  /** 挿入位置（0始まり。その位置に差し込む。範囲外は端へ丸める） */
  index: number,
  /**
   * 挿入するタスク自身。既存タスクを動かす場合に渡すと振り直しへ自身も含める。
   * 新規作成（まだ id が無い）なら省略する
   */
  moving: Task | null = null
): SortOrderPlacement {
  const at = Math.max(0, Math.min(index, siblings.length));
  const before = at === 0 ? null : siblings[at - 1].sortOrder;
  const after = at === siblings.length ? null : siblings[at].sortOrder;

  const middle = insertBetween(before, after);
  if (middle.ok) return { sortOrder: middle.value, renumber: [] };

  // 中間値が尽きた: 挿入後の並びを1000刻みに振り直す（§3.5）
  const numbers = renumberSortOrders(siblings.length + 1);
  const inserted = [...siblings.slice(0, at), moving, ...siblings.slice(at)];

  return {
    sortOrder: numbers[at],
    renumber: inserted.flatMap((task, i) =>
      task === null ? [] : [{ taskId: task.id, sortOrder: numbers[i] }]
    ),
  };
}

/** 振り直し: 現在の並び順を保ったまま1000刻みへ戻す */
export function renumberSortOrders(count: number): number[] {
  return Array.from({ length: count }, (_, i) => (i + 1) * SORT_ORDER_STEP);
}

/**
 * 途中挿入・並び替えの中間値。
 * 前後の差が1で中間値が取れないときは振り直しが必要（`needs_renumber`）
 */
function insertBetween(
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
