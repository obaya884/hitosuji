// デイリーの表（画面定義書01 §3.3）の DOM 読み取り。列位置の取り違えとポップオーバーの
// 候補順は仕様そのものなので、どのテストからも同じ読み方をするためここに集約する。
// ここが持つのは**デイリーの表に固有の「行の形」**——名前セルがボタンである・列が8つある・
// 選択行が地色で示される、といった前提に依る読み取り。**行の取り方は表の作りごとに違う**ので
// 共有側（`@/app/_testing/dom`）には置かない（マスタは `masters/_testing/table-helpers.ts`）。
import { screen, within } from "@testing-library/react";

/**
 * タスク行の列数（§3.3。バンドルの道 F-119 の帯列を含む）。
 * `cellsOf` が名前を付けている列と同数で、`taskRows` の判定が使う
 */
const TASK_ROW_COLUMN_COUNT = 9;

/**
 * 列の並び（§3.3）でセルを名前で引く。列位置の取り違えを検出できるようにする。
 * **列を足すときは `TASK_ROW_COLUMN_COUNT` も一緒に直す**（タスク行かどうかの判定が列数を見る）
 */
export function cellsOf(tr: HTMLElement) {
  const td = tr.querySelectorAll("td");
  // 列がずれても「空セルを期待する assert」は緑のまま通るので、ここで行の形を確かめておく
  if (td.length !== TASK_ROW_COLUMN_COUNT) {
    throw new Error(`タスク行ではありません（列数 ${td.length} / 期待 ${TASK_ROW_COLUMN_COUNT}）`);
  }
  return {
    road: td[0] as HTMLElement,
    punch: td[1] as HTMLElement,
    name: td[2] as HTMLElement,
    project: td[3] as HTMLElement,
    mode: td[4] as HTMLElement,
    estimate: td[5] as HTMLElement,
    actual: td[6] as HTMLElement,
    time: td[7] as HTMLElement,
    menu: td[8] as HTMLElement,
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
 * タスク名で引くタスク行。**名前セルがボタン**（クリックで rename に入る入口。§3.3）
 * であることを使って役割で引き、そこから行へ遡る——素の文言で引くと、同じ名前が
 * セクション併記やコメント全文にも出るデイリーでは取り違える。
 *
 * **名前を編集中の行は引けない**（名前セルが入力欄に変わるため）。その状態を掴みたいテストは
 * `screen.getByRole("textbox").closest("tr")` を使う。
 * この引き方は「同じ文言が画面に1つだけ」ではなく、**「名前セルがクリック入口である」ことを主張する**。
 * 同名の行が並ぶ場合（複製 O-11 / O-14）は `getByRole` が throw するので `rowAt` を使う
 */
export function taskRow(name: string): HTMLElement {
  const tr = screen.getByRole("button", { name }).closest("tr");
  if (tr === null) throw new Error(`行が見つかりません: ${name}`);
  // 同名のボタンは行メニュー項目・ポップオーバー候補・トーストにも現れうる。掴んだ行が
  // タスク行かをここで確かめないと、別の `tr` を返しても assert が静かに通る（`cellsOf` と同じ理由）
  if (tr.querySelectorAll("td").length !== TASK_ROW_COLUMN_COUNT) {
    throw new Error(`「${name}」で掴んだのはタスク行ではありません（列数 ${tr.querySelectorAll("td").length}）`);
  }
  return tr;
}

/** 表示順 index 番目のタスク行。複製（O-11/O-14）のように同名の行が並ぶ場合に使う */
export function rowAt(index: number): HTMLElement {
  const rows = taskRows();
  if (rows[index] === undefined) throw new Error(`${index} 番目の行がありません`);
  return rows[index];
}

/**
 * 表示順のタスク名。並び替え・追加・削除の検証に使う。
 * **名前を編集中の行は落ちる**（名前セルが入力欄でボタンが無いため）ので、編集を開いたまま
 * 本数を主張しない——「消えた」と「編集中」が区別できなくなる
 */
export function rowNames(): string[] {
  return taskRows().flatMap((tr) => {
    const nameButton = cellsOf(tr).name.querySelector("button");
    return nameButton === null ? [] : [nameButton.textContent ?? ""];
  });
}

/** 選択行の強調（§5）。行の地色で示す */
export function isSelected(target: string | HTMLElement): boolean {
  const tr = typeof target === "string" ? taskRow(target) : target;
  return tr.classList.contains("bg-accent-weak");
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
