// Server Action の偽物を作る道具（T-43）。差し替えの是非は アーキテクチャ定義書 §8
// 「偽物を置いてよい境界」を参照——ここが提供するのは**解決の時点をテストが握る**形だけ。
import type { ActionResult } from "@/app/_lib/action-result";

/**
 * まだ解決していない Server Action の返り値と、その解決手。
 * 「保存中は押せない」「保留中に別の操作をしても壊れない」のように、
 * **サーバ応答を待っている最中の画面**を主張するテストで使う。
 *
 * 型は全画面共有の `ActionResult`（各画面の `DailyActionResult` 等はその別名。T-08）
 */
export function deferredAction(): Readonly<{
  promise: Promise<ActionResult>;
  resolve: (result: ActionResult) => void;
}> {
  let resolve!: (result: ActionResult) => void;
  const promise = new Promise<ActionResult>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}
