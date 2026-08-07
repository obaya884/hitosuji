// タスクの自動セクション移動（F-113）
// 挙動の契約は画面定義書01 §4.2、書き換わる列と採番は データモデル定義書 §4.4 が正。
// §4.2 が定める2つの位置（現在位置・開始時刻順の位置）もここが持つ——
// 開始時刻順の位置は複製して開始（F-208 / O-14）からも引かれる
import { groupTasksBySection, orderTasksForDisplay } from "./daily-list";
import { sectionAt, type Section, type SectionId } from "../section/section";
import {
  placeSortOrder,
  renumberSortOrders,
  seatsBetween,
  tasksInSection,
} from "./sort-order";
import { taskStatus } from "./status";
import type { Task, TaskId } from "./task";

/** 1タスクの移動先。sortOrder は移動先グループ内での採番済みの値 */
export type Relocation = Readonly<{
  taskId: TaskId;
  sectionId: SectionId | null;
  sortOrder: number;
}>;

/**
 * 「開始時刻順の位置」（画面定義書01 §4.2）: `startedAt` に打刻したタスクが `siblings` の
 * 何番目に入るかを返す。自分より遅い開始時刻の打刻済みタスク、または最初の未実行タスクの直前。
 * `siblings` は**セクション内を sort_order 昇順に並べたもの**（`tasksInSection` が保証する）
 */
export function startOrderIndex(siblings: readonly Task[], startedAt: Date): number {
  const at = siblings.findIndex(
    (t) => t.startedAt === null || t.startedAt.getTime() > startedAt.getTime()
  );
  return at === -1 ? siblings.length : at;
}

/** 移動計画を当てた新しいタスク列を返す（入力は変更しない。順序も入力のまま） */
export function withRelocations(
  tasks: readonly Task[],
  relocations: readonly Relocation[]
): Task[] {
  const moved = new Map(relocations.map((r) => [r.taskId, r]));
  return tasks.map((task) => {
    const to = moved.get(task.id);
    return to === undefined ? task : { ...task, sectionId: to.sectionId, sortOrder: to.sortOrder };
  });
}

/**
 * 規則a（画面定義書01 §4.2-a）: 開始したタスク自身を、開始時刻を含むセクションへ移す。
 * 既にそのセクションにいる場合もセクション内で置き直す。移動が不要なら空配列
 */
export function relocationOnStart(
  task: Task,
  sameDayTasks: readonly Task[],
  sections: readonly Section[],
  startedAt: Date,
  startClock: string
): Relocation[] {
  return relocationInStartOrder(task, sameDayTasks, sections, startedAt, startClock);
}

/**
 * 規則c（画面定義書01 §4.2-c）: 開始時刻を修正したタスク自身を、修正後の時刻を含むセクションへ移す。
 * 規則aとの差は基準にする時刻だけ（打刻の実時刻か、修正後の値か）。移動が不要なら空配列
 */
export function relocationOnPunchEdit(
  task: Task,
  sameDayTasks: readonly Task[],
  sections: readonly Section[],
  editedStartedAt: Date,
  startClock: string
): Relocation[] {
  return relocationInStartOrder(task, sameDayTasks, sections, editedStartedAt, startClock);
}

/**
 * 規則a / c 共通（画面定義書01 §4.2「開始時刻順の位置」）: `startClock` を含むセクションの
 * 開始時刻順の位置へ `task` を移す。打刻済みタスクとは `startedAt` の昇順で並び、
 * 未実行タスクよりは前に入る（＝上から実行順のログとして読める）。
 *
 * 規則a / c を1本にまとめず名前付きの入口を2つ残すのは、条項と関数の対応を保つため
 * （アーキテクチャ定義書 §1「迷ったら仕様書と対応が取れる方」）。
 *
 * `startedAt` と `startClock` は**同じ時刻の2表現**——前者は並び順の判定に、後者は
 * 移動先セクションの判定に使う。`task.startedAt` 自身は見ない（規則aでは打刻の書き込み前で
 * まだ null。`task` は siblings から除く）
 */
function relocationInStartOrder(
  task: Task,
  sameDayTasks: readonly Task[],
  sections: readonly Section[],
  startedAt: Date,
  startClock: string
): Relocation[] {
  const destination = sectionAt(sections, startClock);
  if (destination === undefined) return [];

  const siblings = tasksInSection(
    sameDayTasks.filter((t) => t.id !== task.id),
    destination.id
  );

  return relocationsFor(task, siblings, startOrderIndex(siblings, startedAt), destination.id);
}

/**
 * 規則b（画面定義書01 §4.2-b）: 「現在位置」より前にある未実行タスクを現在位置の直後へ繰り下げる計画。
 * 移動が不要なら空配列
 */
export function planCarryOver(
  tasks: readonly Task[],
  sections: readonly Section[],
  nowClock: string
): Relocation[] {
  const ordered = orderTasksForDisplay(tasks, sections);
  const runningTask = ordered.find((t) => taskStatus(t) === "running");

  // 移動先セクション（＝「現在位置」が属するセクション）
  const destinationSectionId = currentPositionSectionId(runningTask, sections, nowClock);
  if (destinationSectionId === null) return [];

  const groups = groupTasksBySection(tasks, sections);
  const destinationGroupIndex = groups.findIndex(
    (g) => g.section !== null && g.section.id === destinationSectionId
  );
  if (destinationGroupIndex === -1) return [];

  const destinationSectionTasks = groups[destinationGroupIndex].tasks;

  // 移動先セクション内で「現在位置」を境に前半（そのまま残る）と後半（元からあった残りの行）に分ける
  const splitIndex = currentPositionIndex(destinationSectionTasks, runningTask);
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
  const seats = seatsBetween(
    stayBeforeInDestination.at(-1)?.sortOrder ?? null,
    remainInDestination[0]?.sortOrder ?? null,
    carryOverTargets.length
  );

  // 中間値が尽きたら移動先セクション全体を振り直す（データモデル定義書 §3.5 の再採番）
  if (!seats.ok) {
    const reordered = [...stayBeforeInDestination, ...carryOverTargets, ...remainInDestination];
    const sortOrders = renumberSortOrders(reordered.length);
    return changedOnly(
      reordered.map((task, i) => ({ task, sortOrder: sortOrders[i] })),
      destinationSectionId
    );
  }

  return changedOnly(
    carryOverTargets.map((task, i) => ({ task, sortOrder: seats.value[i] })),
    destinationSectionId
  );
}

/**
 * 打刻の取り消しに伴う戻し位置（開始の取り消し F-210 / データモデル定義書 §4.5、
 * 完了の取り消し F-212 / 同書 §4.7）。取り消したタスクを未実行として「現在位置」（画面定義書01 §4.2:
 * 他に実行中タスクがあればその直後、なければ現在時刻を含むセクションの未実行タスクの先頭）へ置く。
 * 開始の取り消しでは対象自身が唯一の実行中タスクなので、常に後者（現在時刻のセクション）になる。
 * 表示日が今日のときだけ呼ぶ。移動が不要（すでにその位置）または現在位置が定まらないなら空配列
 */
export function relocationOnUndoPunch(
  task: Task,
  sameDayTasks: readonly Task[],
  sections: readonly Section[],
  nowClock: string
): Relocation[] {
  // 取り消す当該タスク自身は「現在位置」の判定・移動先の並びのいずれからも除く
  const others = sameDayTasks.filter((t) => t.id !== task.id);
  const running = others.find((t) => taskStatus(t) === "running");

  const destinationSectionId = currentPositionSectionId(running, sections, nowClock);
  if (destinationSectionId === null) return [];

  const siblings = tasksInSection(others, destinationSectionId);

  // 「現在位置」＝実行中タスクの直後、なければ未実行タスクの先頭の直前（＝完了のログの後ろ）
  const index = currentPositionIndex(siblings, running);

  return relocationsFor(task, siblings, index, destinationSectionId);
}

/**
 * 移動先セクション（`sectionId`）の `siblings` の `index` 番目へ `task` を差し込む Relocation 列。
 * 採番も振り直しもデータモデル定義書 §3.5 の共通規則（`placeSortOrder`）が決め、ここは
 * 「実際に変わる行だけ動かす」ぶんを取り出すだけ。
 * `siblings` は `placeSortOrder` と同じ前提——**`task` を除いた sort_order 昇順の並び**
 */
function relocationsFor(
  task: Task,
  siblings: readonly Task[],
  index: number,
  sectionId: SectionId
): Relocation[] {
  const placed = placeSortOrder(siblings, index, task);
  if (placed.renumber.length === 0) {
    return changedOnly([{ task, sortOrder: placed.sortOrder }], sectionId);
  }

  // 中間値が尽きた: 移動先セクション全体の振り直しを、変更前のタスクへ突き合わせる。
  // `renumber` の taskId は `placeSortOrder` が `[task, ...siblings]` からのみ作るので必ず引ける
  const byId = new Map([task, ...siblings].map((t) => [t.id, t]));
  return changedOnly(
    placed.renumber.map(({ taskId, sortOrder }) => ({ task: byId.get(taskId)!, sortOrder })),
    sectionId
  );
}

/**
 * 「現在位置」が属するセクション（画面定義書01 §4.2）。実行中タスクがあればそのセクション、
 * なければ現在時刻を含むセクション。定まらないなら null（実行中タスクが未分類のまま——
 * 通常ありえないが念のため——か、有効セクションが1つも無い退避時）
 */
function currentPositionSectionId(
  runningTask: Task | undefined,
  sections: readonly Section[],
  nowClock: string
): number | null {
  if (runningTask !== undefined) return runningTask.sectionId;
  return sectionAt(sections, nowClock)?.id ?? null;
}

/**
 * セクション内で「現在位置」に当たる位置（画面定義書01 §4.2）。
 * 実行中タスクの直後、実行中タスクが無ければ未実行タスクの先頭（1件も無ければ末尾）。
 * `sectionTasks` には**セクション内の表示順に並べたタスク**を渡すこと（位置を数える前提）
 */
function currentPositionIndex(
  sectionTasks: readonly Task[],
  runningTask: Task | undefined
): number {
  if (runningTask === undefined) {
    const firstNotStarted = sectionTasks.findIndex((t) => taskStatus(t) === "not_started");
    return firstNotStarted === -1 ? sectionTasks.length : firstNotStarted;
  }
  const runningIndex = sectionTasks.findIndex((t) => t.id === runningTask.id);
  return runningIndex === -1 ? sectionTasks.length : runningIndex + 1;
}

/** 実際に section_id か sort_order が変わる行だけを Relocation にする（無駄な UPDATE を避ける） */
function changedOnly(
  assignments: readonly Readonly<{ task: Task; sortOrder: number }>[],
  sectionId: SectionId
): Relocation[] {
  return assignments.flatMap(({ task, sortOrder }) =>
    task.sectionId === sectionId && task.sortOrder === sortOrder
      ? []
      : [{ taskId: task.id, sectionId, sortOrder }]
  );
}
