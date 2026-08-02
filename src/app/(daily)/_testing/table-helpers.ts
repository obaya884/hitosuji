// デイリーの表（画面定義書01 §3.3）の DOM 読み取り。列位置の取り違えとポップオーバーの
// 候補順は仕様そのものなので、どのテストからも同じ読み方をするためここに集約する。
// **画面をまたぐ読み取り（単一行の特定・クラス判定・色の表記変換）は `@/app/_testing/dom`**
// ——ここが持つのはデイリーの表に固有の「行の形」と列の並びの知識。
import { within } from "@testing-library/react";

/** タスク行の列数（§3.3）。`cellsOf` が名前を付けている列と同数で、`taskRows` の判定が使う */
const TASK_ROW_COLUMN_COUNT = 8;

/**
 * 列の並び（§3.3）でセルを名前で引く。列位置の取り違えを検出できるようにする。
 * **列を足すときは `TASK_ROW_COLUMN_COUNT` も一緒に直す**（タスク行かどうかの判定が列数を見る）
 */
export function cellsOf(row: HTMLElement) {
  const td = row.querySelectorAll("td");
  // 列がずれても「空セルを期待する assert」は緑のまま通るので、ここで行の形を確かめておく
  if (td.length !== TASK_ROW_COLUMN_COUNT) {
    throw new Error(`タスク行ではありません（列数 ${td.length} / 期待 ${TASK_ROW_COLUMN_COUNT}）`);
  }
  return {
    punch: td[0] as HTMLElement,
    name: td[1] as HTMLElement,
    project: td[2] as HTMLElement,
    mode: td[3] as HTMLElement,
    estimate: td[4] as HTMLElement,
    actual: td[5] as HTMLElement,
    time: td[6] as HTMLElement,
    menu: td[7] as HTMLElement,
  };
}

/**
 * 表示順のタスク行。**全列そろっている行だけがタスク行**という判定にする——見出し行と
 * コメント行（O-16）は `colSpan` で列数が減り、画面上の他の表（ショートカット一覧）の行も
 * 列数が違う。`document` 全体を見る以上、緩い条件だとそれらを拾ってしまう
 */
export function taskRows(): HTMLElement[] {
  return allRows().filter((tr) => tr.querySelectorAll("td").length === TASK_ROW_COLUMN_COUNT);
}

/**
 * セクション見出し行（td が1つ = colSpan の行）。タスク行にも同じセクション名が
 * 併記される（§3.3）ため、まず行の形で見出しだけに絞ってから名前で引く
 */
export function headingOf(label: string): HTMLElement {
  const heading = allRows()
    .filter((tr) => tr.querySelectorAll("td").length === 1)
    .find((tr) => within(tr).queryByText(label) !== null);
  if (heading === undefined) throw new Error(`セクション見出し「${label}」が見つかりません`);
  return heading;
}

/** 画面上のすべての `tr`（この表以外の行も含む）。行の形で絞る読み取りが同じ経路を通るために持つ */
function allRows(): HTMLElement[] {
  return [...document.querySelectorAll("tr")];
}

/** ポップオーバーの候補ラベル（表示順） */
export function popoverLabels(): string[] {
  return [...document.querySelectorAll("[data-option-index]")].map((b) => b.textContent ?? "");
}

/** 現在値としてチェックが付いた候補のラベル（F-112。チェックは `svg` で描かれる） */
export function checkedPopoverLabels(): string[] {
  return [...document.querySelectorAll("[data-option-index]")]
    .filter((b) => b.querySelector("svg") !== null)
    .map((b) => b.textContent ?? "");
}
