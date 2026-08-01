// Server Action の共通結果型（全画面共有）。成功か、失敗（表示用メッセージ付き）かを表す。
// 各画面の結果型（DailyActionResult / RoutineActionResult / masters の ActionResult）はこれを別名で再エクスポートする（T-08）
import { SAVE_FAILED } from "./error-messages";

export type ActionResult = Readonly<{ ok: true } | { ok: false; message: string }>;

/** 失敗した結果（メッセージの形は `ActionResult` から導く） */
type Failed = Extract<ActionResult, { ok: false }>;

/**
 * 結果が届かなかった失敗。通信断・タイムアウト・サーバ側の異常終了で呼び出しが拒否されたときに
 * `callAction` が作る。**サーバが返した失敗と区別するための印**で、こちらは画面の取り直しに行かない——
 * 届かない以上また失敗するだけのため（画面定義書00_共通 §4.1。判定は `isUnreachable`）
 */
export type UnreachableFailure = Failed & Readonly<{ unreachable: true }>;

/** サーバが返した失敗と、届かなかった失敗（`UnreachableFailure`）の両方 */
export type ActionFailure = Failed & Readonly<{ unreachable?: true }>;

/**
 * Server Action の呼び出しを包み、**拒否を失敗の結果へ落とす**（画面定義書00_共通 §4.1）。
 * これを通すことで、呼び出し側は「`ok: false` を見る」1経路だけを扱えばよくなる——
 * 各画面の実行関数に `try/catch` を書き足す形にしないのは、Server Action を呼ぶ箇所が増えるたび
 * catch の書き忘れが起こりうるため（FB-64）。
 * 成功時に値を返すアクション（`CreatingActionResult` 等）もそのまま通せる
 */
export async function callAction<T extends ActionResult>(
  action: () => Promise<T>
): Promise<T | UnreachableFailure> {
  try {
    return await action();
  } catch (error) {
    // ユーザーにはトーストで伝わる（§4.1）が、原因は文言に出ないのでコンソールへ残す
    console.error("Server Action の呼び出しに失敗しました", error);
    return { ok: false, message: SAVE_FAILED, unreachable: true };
  }
}

/** 結果が届かなかった失敗か（`UnreachableFailure` の doc のとおり、これだけは取り直しに行かない） */
export function isUnreachable(result: ActionFailure): result is UnreachableFailure {
  return result.unreachable === true;
}
