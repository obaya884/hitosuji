// 行選択モデル（画面定義書01 §5）
// リスト上に常に選択行が1つ存在し、各ショートカットは選択行に作用する
import type { SectionId } from "../section/section";
import { taskStatus } from "./status";
import type { Task, TaskId } from "./task";

/**
 * 「現在地」（§5）: 実行中タスク（規則1）、なければ `currentNotStartedId`（規則2〜4）。
 * 初期選択と N キーのジャンプ先の両方に使う（同じ規則）
 */
export function currentTaskId(
  orderedTasks: readonly Task[],
  currentSectionId: SectionId | null
): TaskId | null {
  const running = orderedTasks.find((t) => taskStatus(t) === "running");
  if (running !== undefined) return running.id;

  return currentNotStartedId(orderedTasks, currentSectionId);
}

/**
 * 現在地の未実行タスク（§5 の規則2〜4）: **現在セクション → 未分類 → 表示順全体**の順に探す。
 * 素の表示順だけで探すとリスト先頭（§3.2）の未分類が常に先に当たり、打刻ループの最中に
 * トリアージ前のインボックスへ飛んでしまう（FB-78）。`currentSectionId` が null
 * （表示日が今日でない等）なら規則2 を飛ばす。実行中タスクは見ない（呼び分けは `currentTaskId` と F-211）
 */
export function currentNotStartedId(
  orderedTasks: readonly Task[],
  currentSectionId: SectionId | null
): TaskId | null {
  const notStarted = orderedTasks.filter((t) => taskStatus(t) === "not_started");

  if (currentSectionId !== null) {
    const inCurrentSection = notStarted.find((t) => t.sectionId === currentSectionId);
    if (inCurrentSection !== undefined) return inCurrentSection.id; // 規則2
  }

  // 規則3（未分類）に専用の分岐は要らない——未分類は表示順の先頭（§3.2）なので、
  // 規則4 の全体探索がそのまま未分類を先に見る
  return notStarted[0]?.id ?? null;
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
 * 選択が実在するタスクを指しているかを保つ（削除・日付移動の後に使う）。
 * `TaskId` / `SectionId` はどちらも素の `number` なので、取り違えても型は捕まえない。
 *
 * @param selectedId いま選ばれている行
 * @param currentSectionId 現在セクション（選択が消えたときの現在地の導出に使う）
 */
export function keepSelection(
  orderedTasks: readonly Task[],
  selectedId: TaskId | null,
  currentSectionId: SectionId | null
): TaskId | null {
  if (selectedId !== null && orderedTasks.some((t) => t.id === selectedId)) return selectedId;
  return currentTaskId(orderedTasks, currentSectionId);
}
