// 並び替え（画面定義書01 O-6 / データモデル定義書 §3.5）
// 表示順は「セクション（start_time 順）→ sort_order」。移動先の前後から中間値を採番する
import { err, ok, type Result } from "../shared/result";
import { insertBetweenSortOrder, renumberSortOrders } from "./sort-order";
import type { Task, TaskId } from "./task";

export type ReorderError = "task_not_found";

/** 並び替えの結果 */
export type Reorder = Readonly<{
  taskId: TaskId;
  sectionId: number | null;
  sortOrder: number;
  /** 中間値が尽きた場合の振り直し（グループ全体の新しい採番。空配列＝振り直しなし） */
  renumber: readonly Readonly<{ taskId: TaskId; sortOrder: number }>[];
}>;

function sorted(tasks: readonly Task[], sectionId: number | null): Task[] {
  return tasks
    .filter((t) => t.sectionId === sectionId)
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

/**
 * タスクを指定セクションの指定位置（0始まり。その位置に差し込む）へ移動する採番を求める。
 * セクションをまたぐ移動では section_id も変わる（O-6）
 */
export function reorderTask(
  tasks: readonly Task[],
  taskId: TaskId,
  destination: Readonly<{ sectionId: number | null; index: number }>
): Result<Reorder, ReorderError> {
  const target = tasks.find((t) => t.id === taskId);
  if (target === undefined) return err("task_not_found");

  // 移動対象を除いた並びに対して挿入位置を決める
  const others = sorted(tasks, destination.sectionId).filter((t) => t.id !== taskId);
  const index = Math.max(0, Math.min(destination.index, others.length));

  const before = index === 0 ? null : others[index - 1].sortOrder;
  const after = index === others.length ? null : others[index].sortOrder;

  const placed = insertBetweenSortOrder(before, after);
  if (placed.ok) {
    return ok({
      taskId,
      sectionId: destination.sectionId,
      sortOrder: placed.value,
      renumber: [],
    });
  }

  // 中間値が尽きた: 移動後の並びで1000刻みに振り直す（データモデル定義書 §3.5）
  const reordered = [...others.slice(0, index), target, ...others.slice(index)];
  const numbers = renumberSortOrders(reordered.length);

  return ok({
    taskId,
    sectionId: destination.sectionId,
    sortOrder: numbers[index],
    renumber: reordered.map((t, i) => ({ taskId: t.id, sortOrder: numbers[i] })),
  });
}

/**
 * Shift+J/K の移動先を求める（画面定義書01 §6）。移動先の「セクションと挿入位置」だけを返し、
 * 採番（sort_order）は算出しない。移動しないとき（リスト全体の端・対象不在）は null を返す。
 * サーバ確定（`moveTaskByStep`）と presentation の楽観更新（`daily-board`）が同じ規則を使うための純関数。
 * `index` は「対象を含むグループ」に対する挿入位置（`reorderTask` が対象を除いて解釈する）
 */
export function stepMoveDestination(
  tasks: readonly Task[],
  taskId: TaskId,
  step: 1 | -1,
  /** 表示順のセクション（未分類を先頭にした並び。null = 未分類） */
  sectionOrder: readonly (number | null)[]
): Readonly<{ sectionId: number | null; index: number }> | null {
  const target = tasks.find((t) => t.id === taskId);
  if (target === undefined) return null;

  const group = sorted(tasks, target.sectionId);
  const nextIndex = group.findIndex((t) => t.id === taskId) + step;
  if (nextIndex >= 0 && nextIndex < group.length) {
    return { sectionId: target.sectionId, index: nextIndex };
  }

  // グループの端: 隣のセクションへ移る
  const sectionIndex = sectionOrder.indexOf(target.sectionId);
  const neighborIndex = sectionIndex + step;
  if (sectionIndex === -1 || neighborIndex < 0 || neighborIndex >= sectionOrder.length) {
    return null; // リスト全体の端なので動かさない
  }

  const neighbor = sectionOrder[neighborIndex];
  // 下へ動くなら移動先の先頭、上へ動くなら移動先の末尾に入る
  return { sectionId: neighbor, index: step === 1 ? 0 : sorted(tasks, neighbor).length };
}

/**
 * 選択タスクを1つ上/下へ動かす（Shift+J/K）。
 * グループの端を越える場合は隣接セクションへまたいで移動する（O-6）
 */
export function moveTaskByStep(
  tasks: readonly Task[],
  taskId: TaskId,
  step: 1 | -1,
  /** 表示順のセクション（未分類を先頭にした並び。null = 未分類） */
  sectionOrder: readonly (number | null)[]
): Result<Reorder, ReorderError> {
  const target = tasks.find((t) => t.id === taskId);
  if (target === undefined) return err("task_not_found");

  const destination = stepMoveDestination(tasks, taskId, step, sectionOrder);
  if (destination === null) {
    // 端なので動かさない（現在位置のまま返す）
    return ok({ taskId, sectionId: target.sectionId, sortOrder: target.sortOrder, renumber: [] });
  }
  return reorderTask(tasks, taskId, destination);
}
