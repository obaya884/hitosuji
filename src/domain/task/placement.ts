// 挿入位置から sort_order を決める（データモデル定義書 §3.5）
// 中間値が尽きた場合は同一グループを1000刻みで振り直す（振り直しは全経路で共通）
import { insertBetweenSortOrder, renumberSortOrders } from "./sort-order";
import type { Task, TaskId } from "./task";

export type Placement = Readonly<{
  sectionId: number | null;
  sortOrder: number;
  /** 中間値が尽きたときの同一グループの振り直し（空配列＝振り直しなし） */
  renumber: readonly Readonly<{ taskId: TaskId; sortOrder: number }>[];
}>;

/**
 * 指定セクションの指定インデックスへ「新しいタスクを差し込む」ときの採番。
 * group は移動対象を含まない、そのセクションの sort_order 昇順の並び
 */
export function placeNewTask(
  group: readonly Task[],
  sectionId: number | null,
  index: number
): Placement {
  const clamped = Math.max(0, Math.min(index, group.length));
  const before = clamped === 0 ? null : group[clamped - 1].sortOrder;
  const after = clamped >= group.length ? null : group[clamped].sortOrder;

  const placed = insertBetweenSortOrder(before, after);
  if (placed.ok) return { sectionId, sortOrder: placed.value, renumber: [] };

  // 中間値が尽きた: 挿入後の並びを1000刻みに振り直す（データモデル定義書 §3.5）
  const numbers = renumberSortOrders(group.length + 1);
  const renumber = group.map((task, i) => ({
    taskId: task.id,
    sortOrder: numbers[i < clamped ? i : i + 1],
  }));

  return { sectionId, sortOrder: numbers[clamped], renumber };
}
