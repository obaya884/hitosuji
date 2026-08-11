// バンドルからの離脱の検知（要件定義書 §5.6 / 画面定義書01 §4.4 / F-119）
import type { BundleId } from "./bundle";
import type { Task, TaskId } from "@/domain/task/task";

export type BundleDeparture = Readonly<{ bundleId: BundleId; remaining: number }>;

/** 開始タスクを除き、最も遅く開始したタスク（＝直前に実行したタスク） */
function latestStarted(tasks: readonly Task[], excludeId: TaskId | null): Task | null {
  let latest: Task | null = null;
  let latestAt: Date | null = null;

  for (const task of tasks) {
    if (task.id === excludeId || task.startedAt === null) continue;
    if (latestAt === null || task.startedAt > latestAt) {
      latest = task;
      latestAt = task.startedAt;
    }
  }
  return latest;
}

/**
 * 開始操作のたびにその場で導出する（状態を持たない。要件定義書 §5.6）。
 * 3条件がすべて成り立つときだけ離脱として返す:
 * 1. 直前に実行したタスクがバンドル A に属する
 * 2. 開始したタスクが A に属さない
 * 3. A のメンバーに未完了が1件以上ある
 *
 * 一度 A を離れると次からは条件1が成り立たなくなるので自然に黙り、
 * メンバーを開始し直すと再び武装する（フラグを持たずに成立する）。
 *
 * `started.id` が null なのは複製して開始（F-208）のとき——生成される行はまだ一覧に無く、
 * 複製はバンドルを引き継がない（データモデル定義書 §4.8）ので非メンバーとして扱う
 */
export function detectBundleDeparture(
  tasks: readonly Task[],
  started: Readonly<{ id: TaskId | null; bundleId: BundleId | null }>
): BundleDeparture | null {
  const previous = latestStarted(tasks, started.id);
  if (previous === null || previous.bundleId === null) return null;

  const bundleId = previous.bundleId;
  if (started.bundleId === bundleId) return null;

  const remaining = tasks.filter((t) => t.bundleId === bundleId && t.endedAt === null).length;
  if (remaining === 0) return null;

  return { bundleId, remaining };
}
