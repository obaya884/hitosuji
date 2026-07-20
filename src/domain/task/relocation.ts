// タスクの自動セクション移動（F-113）
// 挙動の契約は画面定義書01 §4.2、書き換わる列と採番は データモデル定義書 §4.4 が正
import { groupTasksBySection, orderTasksForDisplay } from "./daily-list";
import { sectionAt, type Section } from "../section/section";
import {
  appendSortOrder,
  insertBetweenSortOrder,
  renumberSortOrders,
  SORT_ORDER_STEP,
} from "./sort-order";
import { taskStatus } from "./status";
import type { Task, TaskId } from "./task";

/** 1タスクの移動先。sortOrder は移動先グループ内での採番済みの値 */
export type Relocation = Readonly<{
  taskId: TaskId;
  sectionId: number | null;
  sortOrder: number;
}>;

/**
 * 規則a（§4.2-a）: 開始したタスク自身を、開始時刻を含むセクションの末尾へ移す。
 * 移動が不要なら null（既にそのセクションにいる／該当セクションが無い場合）
 */
export function relocationOnStart(
  task: Task,
  sameDayTasks: readonly Task[],
  sections: readonly Section[],
  startClock: string
): Relocation | null {
  const destination = sectionAt(sections, startClock);
  if (destination === undefined) return null;
  if (task.sectionId === destination.id) return null;

  const siblingSortOrders = sameDayTasks
    .filter((t) => t.sectionId === destination.id && t.id !== task.id)
    .map((t) => t.sortOrder);

  return {
    taskId: task.id,
    sectionId: destination.id,
    sortOrder: appendSortOrder(siblingSortOrders),
  };
}

/**
 * 規則c（§4.2-c）: 開始時刻を修正したタスク自身を、修正後の時刻を含むセクションへ移す。
 * 規則aと違い、移動先での位置は**開始時刻順**にする（ログの訂正であり、
 * 打刻済みタスクと時刻順に並んでいないと記録として読めないため）。移動が不要なら空配列
 */
export function relocationOnPunchEdit(
  task: Task,
  sameDayTasks: readonly Task[],
  sections: readonly Section[],
  editedStartedAt: Date,
  startClock: string
): Relocation[] {
  const destination = sectionAt(sections, startClock);
  if (destination === undefined) return [];

  const siblings = sameDayTasks
    .filter((t) => t.sectionId === destination.id && t.id !== task.id)
    .sort((a, b) => a.sortOrder - b.sortOrder);

  // 自分より遅い開始時刻の打刻済みタスク、または最初の未実行タスクの直前に入る
  const insertAt = siblings.findIndex(
    (t) => t.startedAt === null || t.startedAt.getTime() > editedStartedAt.getTime()
  );
  const index = insertAt === -1 ? siblings.length : insertAt;

  const sortOrder = insertBetweenSortOrder(
    siblings[index - 1]?.sortOrder ?? null,
    siblings[index]?.sortOrder ?? null
  );

  // 中間値が尽きたら移動先セクション全体を振り直す（§3.5 の再採番）
  if (!sortOrder.ok) {
    const reordered = [...siblings.slice(0, index), task, ...siblings.slice(index)];
    const sortOrders = renumberSortOrders(reordered.length);
    return changedOnly(reordered, destination.id, (_, i) => sortOrders[i]);
  }

  return changedOnly([task], destination.id, () => sortOrder.value);
}

/**
 * 規則b（§4.2-b）: 「現在位置」より前にある未実行タスクを現在位置の直後へ繰り下げる計画。
 * 移動が不要なら空配列
 */
export function planCarryOver(
  tasks: readonly Task[],
  sections: readonly Section[],
  nowClock: string
): Relocation[] {
  const ordered = orderTasksForDisplay(tasks, sections);
  const runningTask = ordered.find((t) => taskStatus(t) === "running");

  // 移動先セクション（＝「現在位置」が属するセクション）を決める
  let destinationSectionId: number;
  if (runningTask !== undefined) {
    if (runningTask.sectionId === null) return []; // 実行中タスクが未分類のままのはずはないが念のため
    destinationSectionId = runningTask.sectionId;
  } else {
    const currentSection = sectionAt(sections, nowClock);
    if (currentSection === undefined) return [];
    destinationSectionId = currentSection.id;
  }

  const groups = groupTasksBySection(tasks, sections);
  const destinationGroupIndex = groups.findIndex(
    (g) => g.section !== null && g.section.id === destinationSectionId
  );
  if (destinationGroupIndex === -1) return [];

  const destinationSectionTasks = groups[destinationGroupIndex].tasks;

  // 移動先セクション内で「現在位置」を境に前半（そのまま残る）と後半（元からあった残りの行）に分ける
  let splitIndex: number;
  if (runningTask !== undefined) {
    const runningIndexInDestination = destinationSectionTasks.findIndex(
      (t) => t.id === runningTask.id
    );
    splitIndex =
      runningIndexInDestination === -1
        ? destinationSectionTasks.length
        : runningIndexInDestination + 1;
  } else {
    const firstNotStartedIndex = destinationSectionTasks.findIndex(
      (t) => taskStatus(t) === "not_started"
    );
    splitIndex =
      firstNotStartedIndex === -1 ? destinationSectionTasks.length : firstNotStartedIndex;
  }
  const beforeInDestination = destinationSectionTasks.slice(0, splitIndex);
  const remainInDestination = destinationSectionTasks.slice(splitIndex);

  // 現在位置より前にある全タスク（他セクション分＋移動先セクション内の前半分）から繰り下げ対象を抽出
  const earlierGroupsTasks = groups.slice(0, destinationGroupIndex).flatMap((g) => g.tasks);
  const beforeCurrentPosition = [...earlierGroupsTasks, ...beforeInDestination];

  const carryOverTargets = beforeCurrentPosition.filter(
    (t) => t.sectionId !== null && taskStatus(t) === "not_started"
  );
  if (carryOverTargets.length === 0) return [];

  const carryOverIds = new Set(carryOverTargets.map((t) => t.id));
  const stayBeforeInDestination = beforeInDestination.filter((t) => !carryOverIds.has(t.id));

  // 繰り下げ対象は「現在位置より前の行」と「元からあった残りの行」の間に、間隔採番で差し込む
  // （データモデル定義書 §3.5・§4.4。対象外の行＝完了・実行中タスクの sort_order は書き換えない）
  const previousOrder = stayBeforeInDestination.at(-1)?.sortOrder ?? 0;
  const nextTask = remainInDestination[0];
  const step =
    nextTask === undefined
      ? SORT_ORDER_STEP
      : Math.floor((nextTask.sortOrder - previousOrder) / (carryOverTargets.length + 1));

  // 中間値が尽きたら移動先セクション全体を振り直す（§3.5 の再採番）
  if (step < 1) {
    const reordered = [...stayBeforeInDestination, ...carryOverTargets, ...remainInDestination];
    const sortOrders = renumberSortOrders(reordered.length);
    return changedOnly(reordered, destinationSectionId, (_, i) => sortOrders[i]);
  }

  return changedOnly(
    carryOverTargets,
    destinationSectionId,
    (_, i) => previousOrder + step * (i + 1)
  );
}

/** 実際に section_id か sort_order が変わる行だけを Relocation にする（無駄な UPDATE を避ける） */
function changedOnly(
  tasks: readonly Task[],
  sectionId: number,
  sortOrderOf: (task: Task, index: number) => number
): Relocation[] {
  const relocations: Relocation[] = [];
  tasks.forEach((task, i) => {
    const sortOrder = sortOrderOf(task, i);
    if (task.sectionId !== sectionId || task.sortOrder !== sortOrder) {
      relocations.push({ taskId: task.id, sectionId, sortOrder });
    }
  });
  return relocations;
}
