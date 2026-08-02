// 画面をまたいで使う操作（T-92）。DOM の読み取りは `dom.ts`、Server Action の偽物は `actions.ts`。
import { act, fireEvent } from "@testing-library/react";

/**
 * 押下から、`startTransition` の中で await される Server Action の解決までを流す。
 * **Server Action を呼ぶコンポーネントテストのクリックはここを通す**（テスト戦略定義書 §4）
 * ——素の `fireEvent.click` だと待つかどうかを assert ごとに書き手が判断することになり、
 * 待たずに読んだ箇所がフレークになる。**呼ぶときは必ず `await` する**（落としても型でも
 * lint でも捕まらず、`act` のスコープが閉じないまま後続のテストが崩れる）。
 *
 * 応答を保留したまま「保存中」を主張するときは `deferredAction` と組み合わせる
 * （解決の時点をテストが握れば `waitFor` で待つ必要がなくなる）。**確定が blur・Enter
 * 起点のものは対象外**なので、そこは `waitFor` が残る。
 * Server Action に届かないクリックは下の `clickWithoutServer`
 */
export async function click(element: HTMLElement): Promise<void> {
  await act(async () => {
    fireEvent.click(element);
  });
}

/**
 * **Server Action に届かないクリック**（行の選択・行メニューやショートカット一覧の開閉・
 * トーストを閉じる）。素の `fireEvent.click`（同期の `act` は `fireEvent` 自身が持つ）で、
 * `click` と違い**応答の解決まで流し切らない**。**待たなくてよいと判断済みであることを
 * 名前で示す**のが役目で、`click` を使うファイルの中では素の `fireEvent.click` を残さない
 * （テスト戦略定義書 §4）。
 *
 * **インライン編集中の行外クリックは対象外**——blur で確定が走り Server Action に届く
 */
export function clickWithoutServer(element: HTMLElement): void {
  fireEvent.click(element);
}
