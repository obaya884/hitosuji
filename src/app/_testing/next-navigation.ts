// `next/navigation` の偽物（T-43）。アプリのルータ文脈の外では本物が動かないため、
// コンポーネントテストでは常に差し替える（テスト戦略定義書 §2「偽物を置いてよい境界」）。
// **画面ごとの判断ではなく段そのものの前提**なので、差し替えは `setup.ts` が一括で行う——
// 各テストファイルに `vi.mock` は要らない（別の契約が要るなら書けばそちらが優先される）。
//
// **ナビゲーションを主張するテストだけがこのモジュールを import する**——遷移先 URL を
// 検証するなら `router`、現在地に応じた描画を見るなら `pathname` を使う。
import type { useRouter } from "next/navigation";
import { vi } from "vitest";

/**
 * `useRouter()` の戻り値。過不足は `satisfies` が検査するので、各メソッドは素の `vi.fn()` でよい
 * （`satisfies` にしているのは、型を満たすことを確かめつつ各要素の `Mock` 型を保つため）。
 * 呼び出し記録は `setup.ts` の `afterEach` が `vi.clearAllMocks()` で毎テスト消す
 */
export const router = {
  push: vi.fn(),
  replace: vi.fn(),
  refresh: vi.fn(),
  prefetch: vi.fn(),
  back: vi.fn(),
  forward: vi.fn(),
  // メソッドではなく値のプロパティ（React の `key` に渡して遷移時に状態を捨てるための識別子）。
  // 本物は遷移のたびに変わるが、この偽物は遷移しないので固定値でよい
  bfcacheId: "test-bfcache-id",
} satisfies ReturnType<typeof useRouter>;

/**
 * `push` 以外に呼ばれたルータ操作の名前。
 *
 * この偽物は `AppRouterInstance` を**全メソッド**実装するため、コンポーネントが
 * `refresh()` や `replace()` を使い始めても既定では誰も気づかない（各ファイルが
 * `push` だけの偽物を持っていた頃は、想定外の API を使った時点で落ちていた）。
 * **遷移手段が `push` 限定である**ことを主張する側で固定する
 */
export function otherRouterCalls(): readonly string[] {
  return (["replace", "refresh", "prefetch", "back", "forward"] as const).filter(
    (name) => router[name].mock.calls.length > 0
  );
}

/**
 * `usePathname()` が返す現在地。`vi.fn()` ではなく可変の箱にしているのは、
 * テスト本文で `pathname.value = "/review"` と**代入して読める**ようにするため。
 *
 * **既定はどの画面にも一致しない番兵**（テスト戦略定義書 §4「既定値は中立に固定する」）。`"/"` を既定に
 * すると、現在地の設定を忘れたテストが「デイリーが現在地」として静かに緑になる。
 * 番兵なら設定漏れは「どこも現在地にならない」で必ず落ちる。各テストの後に
 * `setup.ts` がここへ戻す
 */
export const UNSET_PATHNAME = "/__unset__";

export const pathname = { value: UNSET_PATHNAME };
