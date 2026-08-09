import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { callAction, handleActionFailure, type ActionResult } from "./action-result";

/**
 * Server Action 実行の共通フック。楽観的更新（N-01）をしない画面向け（画面定義書02 §1・03 §1）。
 * 実行前にエラーを消し、完了を待ってから成功なら `onSuccess` を呼び、失敗なら message をエラー表示する。
 * 楽観的更新ありの画面（デイリー）は別に `run`（`(daily)/_components/daily-board.tsx`）を持つ。
 *
 * `run` は `ActionResult` を拡張した結果型（例: 作成した id を返す `CreateBundleActionResult`。
 * 画面定義書05 §4 O-1）もそのまま扱える——`onSuccess` へ結果を渡すので、生成物の id が要る
 * 呼び出し側（作成したバンドルを選択状態にする、等）は結果から読める。既存の呼び出し側は
 * 引数無しの `() => …` のままでよい（TypeScript は少ない引数のコールバックを許す）
 *
 * 失敗の扱いは `handleActionFailure`。ロールバックは無い（画面がまだ変わっていないため。
 * 編集状態は呼び出し側が残す。00_共通 §2.3 失敗時）
 */
export function useServerAction() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run<T extends ActionResult>(action: () => Promise<T>, onSuccess?: (result: T) => void) {
    setError(null);
    startTransition(async () => {
      const result = await callAction(action);
      if (result.ok) {
        onSuccess?.(result);
        return;
      }
      handleActionFailure(result, { setError, refresh: () => router.refresh() });
    });
  }

  return { error, setError, isPending, run };
}
