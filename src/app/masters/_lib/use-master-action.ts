import { useState, useTransition } from "react";
import type { ActionResult } from "./action-result";

/**
 * マスタ管理（modes/projects/sections）の各テーブル共通の Server Action 実行フック（画面定義書03）。
 * 実行前にエラーを消し、失敗時はメッセージを表示、成功時は `onSuccess` を呼ぶ（楽観更新はしない）。
 */
export function useMasterAction() {
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
