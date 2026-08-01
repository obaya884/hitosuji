import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { callAction, isUnreachable, type ActionResult } from "./action-result";

/**
 * Server Action 実行の共通フック。楽観的更新（N-01）をしない画面向け（画面定義書02 §1・03 §1）。
 * 実行前にエラーを消し、完了を待ってから成功なら `onSuccess` を呼び、失敗なら message をエラー表示する。
 * 楽観的更新ありの画面（デイリー）は別に `run`（`(daily)/_components/daily-board.tsx`）を持つ。
 *
 * 失敗の扱いは画面定義書00_共通 §4.1 が正——拒否（通信断等）も `callAction` が結果へ落とすので
 * 素通りせず、**サーバが失敗を返したときだけ**表示中のデータを取り直す。ロールバックは無い
 * （画面がまだ変わっていないため。編集状態は呼び出し側が残す。§2.3 失敗時）
 */
export function useServerAction() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await callAction(action);
      if (result.ok) {
        onSuccess?.();
        return;
      }
      setError(result.message);
      if (!isUnreachable(result)) router.refresh();
    });
  }

  return { error, setError, isPending, run };
}
