// sort_order の採番と並び順（データモデル定義書 §3.5）
// 連番ではなく1000刻み。途中挿入は前後の中間値を振り、中間値が尽きたときだけ振り直す
import type { SectionId } from "../section/section";
import { err, ok, type Result } from "../shared/result";
import type { Task, TaskId } from "./task";

const SORT_ORDER_STEP = 1000;

/**
 * 採番の振り直し。挿入・移動と同じトランザクションで反映する（§3.5）。
 * **空配列＝振り直しなし**（「なにもしない」の表し方はこの1通りだけ）
 */
export type Renumber = readonly Readonly<{ taskId: TaskId; sortOrder: number }>[];

/** 新規1行を差し込む・既存1行を動かすときの採番結果 */
export type SortOrderPlacement = Readonly<{
  /** 挿入するタスク自身の sort_order */
  sortOrder: number;
  /** 中間値が尽きたときの同一グループの振り直し（空配列＝振り直しなし） */
  renumber: Renumber;
}>;

/** 同一グループのタスクを sort_order 昇順に並べる（表示順の第2キー。§3.5） */
export function sortedBySortOrder(tasks: readonly Task[]): Task[] {
  return [...tasks].sort((a, b) => a.sortOrder - b.sortOrder);
}

/** 指定セクション（null = 未分類）のタスクを sort_order 昇順で取り出す（§3.5） */
export function tasksInSection(tasks: readonly Task[], sectionId: SectionId | null): Task[] {
  return sortedBySortOrder(tasks.filter((t) => t.sectionId === sectionId));
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
  /**
   * 挿入対象を除いた、同一グループの並び。**sort_order 昇順であること**
   * （`tasksInSection` が保証する）。降順で渡すと前後の判定が壊れる
   */
  siblings: readonly Task[],
  /** 挿入位置（0始まり。その位置に差し込む。範囲外は端へ丸める） */
  index: number,
  /**
   * 挿入するタスク自身。既存タスクを動かす場合に渡すと振り直しへ自身も含める。
   * 新規作成（まだ id が無い）なら省略する
   */
  moving?: Task
): SortOrderPlacement {
  const { at, before, after } = neighborsAt(siblings, index);

  const middle = insertBetween(before, after);
  if (middle.ok) return { sortOrder: middle.value, renumber: [] };

  // 中間値が尽きた: 挿入後の並びを1000刻みに振り直す（§3.5）。
  // `undefined` は挿入するタスク自身の席——新規作成はまだ id が無いので振り直しに含めない
  const numbers = renumberSortOrders(siblings.length + 1);
  const inserted = [...siblings.slice(0, at), moving, ...siblings.slice(at)];

  return {
    sortOrder: numbers[at],
    renumber: inserted.flatMap((task, i) =>
      task === undefined ? [] : [{ taskId: task.id, sortOrder: numbers[i] }]
    ),
  };
}

/**
 * **元の行の直下へ新規行を1件差し込む**採番（§3.5）。`tasks`（同じ日のタスク全件）から
 * `anchor` と同じグループ（セクション。未分類なら未分類）を取り出し、その1つ後ろへ置く。
 * **なぜ直下なのかは各ユースケースの条項が持つ**（ここが持つのは採番の手続きだけ）。
 *
 * 呼び出し側が守ること:
 * - `anchor` は `tasks` に含まれていること（含まれないと先頭に置かれる）
 * - **差し込む行は `anchor` と同じセクションへ置くこと**——採番は `anchor` のグループで決まるが、
 *   差し込む行自身の `sectionId` は呼び出し側が別に与えるので、食い違うと静かに位置だけが狂う
 * - **既存行の移動には使わない**——`placeSortOrder` に `moving` を渡さない（差し込む行はまだ
 *   id を持たない）ので、振り直しが要る場面でその行自身が `renumber` から漏れる
 */
export function placeNewBelow(tasks: readonly Task[], anchor: Task): SortOrderPlacement {
  const siblings = tasksInSection(tasks, anchor.sectionId);
  return placeSortOrder(siblings, siblings.findIndex((t) => t.id === anchor.id) + 1);
}

/** 新規2行を連続して差し込むときの採番（`placeNewPair` の結果） */
export type PairPlacement = Readonly<{
  /** 先に来る行の sort_order */
  first: number;
  /** その直下に来る行の sort_order */
  second: number;
  /** 中間値が尽きたときの同一グループの振り直し（空配列＝振り直しなし） */
  renumber: Renumber;
}>;

/**
 * **まだ id を持たない2行**を `index` の位置へ連続して差し込む採番（§3.5 の例外）。
 * **2行を一度に採番する**——1行ずつ置くと、1行目の振り直しを2行目の採番が見ない。
 * 席が取れなければ挿入後の並び（既存 + 2）を1000刻みへ振り直す
 */
export function placeNewPair(siblings: readonly Task[], index: number): PairPlacement {
  const { at, before, after } = neighborsAt(siblings, index);

  const seats = seatsBetween(before, after, 2);
  if (seats.ok) return { first: seats.value[0], second: seats.value[1], renumber: [] };

  // `undefined` は差し込む2行の席——新規作成はまだ id が無いので振り直しに含めない
  const numbers = renumberSortOrders(siblings.length + 2);
  const inserted = [...siblings.slice(0, at), undefined, undefined, ...siblings.slice(at)];

  return {
    first: numbers[at],
    second: numbers[at + 1],
    renumber: inserted.flatMap((task, i) =>
      task === undefined ? [] : [{ taskId: task.id, sortOrder: numbers[i] }]
    ),
  };
}

/**
 * `before` と `after` の間に `count` 個の席を等間隔で取る（§3.5）。
 * `after` が無ければ末尾なので1000刻みで続ける。等間隔にできない（隙間が席数に足りない）なら
 * `needs_renumber`。**先頭（`before` が無い）でも 0 を起点に等分する**ので、後続より前に必ず収まる
 */
export function seatsBetween(
  before: number | null,
  after: number | null,
  count: number
): Result<number[], "needs_renumber"> {
  const base = before ?? 0;
  const step = after === null ? SORT_ORDER_STEP : Math.floor((after - base) / (count + 1));
  if (step < 1) return err("needs_renumber");
  return ok(Array.from({ length: count }, (_, i) => base + step * (i + 1)));
}

/** 挿入位置と、その前後にいる既存行の sort_order（範囲外の index は端へ丸める） */
function neighborsAt(
  siblings: readonly Task[],
  index: number
): Readonly<{ at: number; before: number | null; after: number | null }> {
  const at = Math.max(0, Math.min(index, siblings.length));
  return {
    at,
    before: at === 0 ? null : siblings[at - 1].sortOrder,
    after: at === siblings.length ? null : siblings[at].sortOrder,
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
