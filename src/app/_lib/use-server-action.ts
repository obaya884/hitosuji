import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { callAction, handleActionFailure, type ActionResult } from "./action-result";

/**
 * 失敗の文言の置き場。`run` は実行の開始時に `null`（前回の失敗を消す）を、
 * 失敗したときに文言を渡す
 */
export type SetActionError = (message: string | null) => void;

/**
 * 保存境界の中核。**エラーの置き場だけ呼び出し側から受け取る**——発生源ごとに表示先を
 * 振り分ける画面（バンドル管理 S-05 は左ペイン・ヘッダとメンバー表で帯が別）が、
 * 実行の手順を書き写さずに済むようにするため。エラーもフックに持たせてよい画面は
 * 下の `useServerAction` を使う。
 *
 * `run` は `ActionResult` を拡張した結果型（例: 作成した id を返す `CreateBundleActionResult`。
 * 画面定義書05 §4 O-1）もそのまま扱える——`onSuccess` へ結果を渡すので、生成物の id が要る
 * 呼び出し側（作成したバンドルを選択状態にする、等）は結果から読める。結果が要らない
 * 呼び出し側は引数無しの `() => …` のままでよい（TypeScript は少ない引数のコールバックを許す）
 *
 * 失敗の扱いは `handleActionFailure`。ロールバックは無い（画面がまだ変わっていないため。
 * 編集状態は呼び出し側が残す。00_共通 §2.3 失敗時）
 */
export function useServerActionRunner(setError: SetActionError) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function run<T extends ActionResult>(
    action: () => Promise<T>,
    onSuccess?: (result: Extract<T, { ok: true }>) => void
  ) {
    setError(null);
    startTransition(async () => {
      const result = await callAction(action);
      if (result.ok) {
        onSuccess?.(result as Extract<T, { ok: true }>);
        return;
      }
      handleActionFailure(result, { setError, refresh: () => router.refresh() });
    });
  }

  return { isPending, run };
}

/**
 * Server Action 実行の共通フック。楽観的更新（N-01）をしない画面向け（画面定義書02 §1・03 §1）。
 * 実行前にエラーを消し、完了を待ってから成功なら `onSuccess` を呼び、失敗なら message を
 * エラー表示する。エラーは帯が1つで足りる画面のためにフックが持つ。
 * 楽観的更新ありの画面（デイリー）は別に `run`（`(daily)/_components/daily-board.tsx`）を持つ
 */
export function useServerAction() {
  const [error, setError] = useState<string | null>(null);
  const { isPending, run } = useServerActionRunner(setError);

  return { error, setError, isPending, run };
}
