"use client";

import { useEffect, useState } from "react";

/**
 * 進行中の合図を出し始めるまでの猶予（画面定義書00_共通 §4.2）。
 * 「本番の通常の操作では合図が出ない」ことを条件に置いた値で、往復時間が変われば見直す
 */
export const SLOW_PENDING_DELAY_MS = 500;

/**
 * 確定を待つ操作が猶予を超えて続いているあいだ `true` を返す（画面定義書00_共通 §4.2）。
 * **猶予内に終わった操作では一度も `true` にならない**——数十msだけ表示される合図は
 * 点滅にしかならないため、遅さそのものを条件にする。
 *
 * 引数は「確定を待つ操作の応答待ちか」で、楽観的更新の操作は含めない
 * （含めると打刻のたびに合図の候補になる）
 */
export function useSlowPending(pending: boolean): boolean {
  // 猶予を超えたことだけを持つ。**消す役と持ち越さない役は別**——
  // 戻り値の `pending &&` が応答の届いた描画で即座に消し（後片付けは描画の後に走るので、
  // これが無いと1フレームだけ合図が残る。**この差はユニット・コンポーネント段では観測できない**
  // ——`act` が描画と後片付けを同じスコープで流し切るため。実測できるとすればブラウザ段だが、
  // 1フレームの点滅に見合わないので通していない）、
  // 後片付けの `setSlow(false)` が次の操作へ持ち越さない（無いと2回目が即座に光る）
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!pending) return;
    const timeoutId = setTimeout(() => setSlow(true), SLOW_PENDING_DELAY_MS);
    return () => {
      clearTimeout(timeoutId);
      setSlow(false);
    };
  }, [pending]);

  return pending && slow;
}
