// 業務的に起こりうる失敗を表現する最小 Result 型（アーキテクチャ定義書 §4）
// throw はインフラの予期外エラーのみに使う
export type Result<T, E> = Readonly<
  { ok: true; value: T } | { ok: false; error: E }
>;

export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
