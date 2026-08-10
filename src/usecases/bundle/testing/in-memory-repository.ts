// テスト用のインメモリ BundleRepository。
// 古典学派の「本物と同じ契約を満たす偽物」であってモックではない（テスト戦略定義書 §2）
import type { Bundle, BundleId } from "@/domain/bundle/bundle";
import type { BundleInput, BundleRepository } from "@/usecases/ports/bundle-repository";

/**
 * 件数を返す2つのメソッドは実DBを持たないので、テストから返り値を固定する。
 * `counts` は referenceCounts（削除可否の分岐を作る）、`memberCounts` は memberCounts
 * （左ペインのメンバー件数。画面定義書05 §3.1）。**どちらも本物と同じく0件の id は省く**
 */
type Counts = Readonly<{
  counts?: Readonly<Record<BundleId, number>>;
  memberCounts?: Readonly<Record<BundleId, number>>;
}>;

export function inMemoryBundleRepository(
  initial: readonly Bundle[] = [],
  { counts = {}, memberCounts = {} }: Counts = {}
): BundleRepository {
  let rows: Bundle[] = initial.map((b) => ({ ...b }));
  let nextId = Math.max(0, ...rows.map((b) => b.id)) + 1;

  return {
    listAll: async () => rows.map((b) => ({ ...b })),

    create: async (input: BundleInput) => {
      const created: Bundle = { id: nextId++, ...input, isArchived: false };
      rows.push(created);
      return { ...created };
    },

    update: async (id: BundleId, input: BundleInput) => {
      rows = rows.map((b) => (b.id === id ? { ...b, ...input } : b));
    },

    setArchived: async (id: BundleId, isArchived: boolean) => {
      rows = rows.map((b) => (b.id === id ? { ...b, isArchived } : b));
    },

    referenceCounts: async (ids: readonly BundleId[]) =>
      Object.fromEntries(ids.filter((id) => counts[id] !== undefined).map((id) => [id, counts[id]])),

    memberCounts: async (ids: readonly BundleId[]) =>
      Object.fromEntries(
        ids.filter((id) => memberCounts[id] !== undefined).map((id) => [id, memberCounts[id]])
      ),

    remove: async (id: BundleId) => {
      rows = rows.filter((b) => b.id !== id);
    },
  };
}
