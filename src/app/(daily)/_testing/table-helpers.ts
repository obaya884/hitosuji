// デイリーの表（画面定義書01 §3.3）の DOM 読み取り。列位置の取り違えとポップオーバーの
// 候補順は仕様そのものなので、どのテストからも同じ読み方をするためここに集約する。
// **画面をまたぐ読み取り（行の取得・クラス判定・色の表記変換）は `@/app/_testing/dom`**。

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

/** ポップオーバーの候補ラベル（表示順） */
export function popoverLabels(): string[] {
  return [...document.querySelectorAll("[data-option-index]")].map((b) => b.textContent ?? "");
}
