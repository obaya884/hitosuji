// 行選択モデル（画面定義書01 §5）
// リスト上に常に選択行が1つ存在し、各ショートカットは選択行に作用する
import { taskStatus } from "./status";
import type { Task, TaskId } from "./task";

/**
 * 「現在地」（§5）: 実行中タスク、なければ表示順で最初の未実行タスク。
 * 初期選択と C キーのジャンプ先の両方に使う（同じ規則）
 */
export function currentTaskId(orderedTasks: readonly Task[]): TaskId | null {
  const running = orderedTasks.find((t) => taskStatus(t) === "running");
  if (running !== undefined) return running.id;

  const firstNotStarted = orderedTasks.find((t) => taskStatus(t) === "not_started");
  return firstNotStarted?.id ?? null;
}

/** 選択行を1つ移動する（J/K・↑↓）。端では止まる */
export function moveSelection(
  orderedTasks: readonly Task[],
  selectedId: TaskId | null,
  step: 1 | -1
): TaskId | null {
  if (orderedTasks.length === 0) return null;
  if (selectedId === null) {
    return step === 1 ? orderedTasks[0].id : orderedTasks[orderedTasks.length - 1].id;
  }

  const index = orderedTasks.findIndex((t) => t.id === selectedId);
  if (index === -1) return orderedTasks[0].id;

  const next = index + step;
  if (next < 0 || next >= orderedTasks.length) return selectedId; // 端では動かさない
  return orderedTasks[next].id;
}

/**
 * 終了打刻でタスクを完了した後に選択を送る先＝表示順で最初の未実行タスク（画面定義書01 §5 / F-211）。
 * 呼び出し側は楽観的更新の適用前のスナップショットを渡すため、終了したばかりのタスクはまだ実行中として
 * 含まれる。currentTaskId（実行中を優先）だとその行を選び直してしまうので、実行中を無視して未実行だけを
 * 見る。送り先がなければ null を返す（呼び出し側は選択を完了行に据え置く）
 */
export function selectionAfterFinish(orderedTasks: readonly Task[]): TaskId | null {
  return orderedTasks.find((t) => taskStatus(t) === "not_started")?.id ?? null;
}

/** 選択が実在するタスクを指しているかを保つ（削除・日付移動の後に使う） */
export function keepSelection(
  orderedTasks: readonly Task[],
  selectedId: TaskId | null
): TaskId | null {
  if (selectedId !== null && orderedTasks.some((t) => t.id === selectedId)) return selectedId;
  return currentTaskId(orderedTasks);
}
