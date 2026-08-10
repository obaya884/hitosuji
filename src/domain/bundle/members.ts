// バンドルのメンバー集合（画面定義書05 §3.2・O-5 / F-119）。
// 並びの規則（開始想定時刻の昇順・同時刻は名前の自然順）はルーチン一覧と共有するので
// `domain/routine/order.ts` の比較関数を借りる
import { byScheduledStartTimeAsc } from "../routine/order";
import type { Routine } from "../routine/routine";
import type { BundleId } from "./bundle";

/**
 * バンドルのメンバー一覧（画面定義書05 §3.2）。開始想定時刻の昇順に固定し、並べ替えは提供しない
 * ——運用ルール「時刻をバンドル順に昇順で付ける」がそのまま並びとして見えるようにするため
 */
export function bundleMembers(routines: readonly Routine[], bundleId: BundleId): Routine[] {
  return routines.filter((r) => r.bundleId === bundleId).sort(byScheduledStartTimeAsc);
}

/**
 * メンバー追加の候補（画面定義書05 O-5）。**どのバンドルにも属していないルーチンだけ**
 * ——他バンドル所属を出すとそちらから黙ってメンバーが抜けるため
 */
export function bundleCandidates(routines: readonly Routine[]): Routine[] {
  return routines.filter((r) => r.bundleId === null).sort(byScheduledStartTimeAsc);
}
