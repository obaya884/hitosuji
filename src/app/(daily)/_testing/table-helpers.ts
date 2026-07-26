// デイリーの表（画面定義書01 §3.3）の DOM 読み取り。列位置の取り違えとポップオーバーの
// 候補順は仕様そのものなので、どのテストからも同じ読み方をするためここに集約する。
// **画面をまたぐ読み取り（行の取得・クラス判定・色の表記変換）は `@/app/_testing/dom`**。
import { within } from "@testing-library/react";

/** 列の並び（§3.3）でセルを名前で引く。列位置の取り違えを検出できるようにする */
export function cellsOf(row: HTMLElement) {
  const td = row.querySelectorAll("td");
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
 * セクション見出し行（td が1つ = colSpan の行）。タスク行にも同じセクション名が
 * 併記される（§3.3）ため、まず行の形で見出しだけに絞ってから名前で引く
 */
export function headingOf(label: string): HTMLElement {
  const heading = [...document.querySelectorAll("tr")]
    .filter((tr) => tr.querySelectorAll("td").length === 1)
    .find((tr) => within(tr as HTMLElement).queryByText(label) !== null);
  if (heading === undefined) throw new Error(`セクション見出し「${label}」が見つかりません`);
  return heading as HTMLElement;
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
