// 参照先 URL を開く（F-125 / 画面定義書01 O-18）。**必ずユーザー操作の同期処理の中で呼ぶ**——
// ブラウザは click / keydown のハンドラを抜けた後（サーバ応答を待った後など）の `window.open` を
// ポップアップとして抑止するため。開始打刻はサーバ確定を待たずにここを通す

/**
 * 新しいタブで開く（同じタブで移ると hitosuji から離れ、終了打刻に戻るのに一手増える）。
 * `noopener` は開いた先から `window.opener` を辿らせないため。
 * null は「URL の無いタスク」で、呼び出し側が分岐しなくて済むよう何もしない
 */
export function openInNewTab(url: string | null): void {
  if (url === null) return;
  window.open(url, "_blank", "noopener,noreferrer");
}
