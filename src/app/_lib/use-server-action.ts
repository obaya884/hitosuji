import { useState, useTransition } from "react";
import type { ActionResult } from "./action-result";

/**
 * Server Action 実行の共通フック（マスタ管理3テーブル・routines で使用。T-52）。
 * 実行前にエラーを消し、失敗時はメッセージを表示、成功時は `onSuccess` を呼ぶ（楽観更新はしない）。
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
