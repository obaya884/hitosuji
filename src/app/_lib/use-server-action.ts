import { useState, useTransition } from "react";
import type { ActionResult } from "./action-result";

/**
 * Server Action 実行の共通フック。楽観的更新（N-01）をしない画面向け（画面定義書02 §1・03 §1）。
 * 実行前にエラーを消し、完了を待ってから成功なら `onSuccess` を呼び、失敗なら message をエラー表示する。
 * 楽観的更新ありの画面（デイリー）は別に `run`（`(daily)/_components/daily-board.tsx`）を持つ。
 */
export function useServerAction() {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<ActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onSuccess?.();
      else setError(result.message);
    });
  }

  return { error, setError, isPending, run };
}
