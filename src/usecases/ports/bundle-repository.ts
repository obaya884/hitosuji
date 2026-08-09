import type { Bundle, BundleId } from "@/domain/bundle/bundle";

export type BundleInput = Readonly<{ name: string; color: string }>;

export type BundleRepository = Readonly<{
  listAll(): Promise<Bundle[]>;
  create(input: BundleInput): Promise<Bundle>;
  update(id: BundleId, input: BundleInput): Promise<void>;
  setArchived(id: BundleId, isArchived: boolean): Promise<void>;
  /**
   * 各バンドルを参照するルーチン・タスクの件数（画面定義書05 §5）。参照0件の id は省略されうる。
   * **展開済みタスクからの参照も数える**（一度でも道が出た日があるバンドルは消せない）
   */
  referenceCounts(ids: readonly BundleId[]): Promise<Readonly<Record<BundleId, number>>>;
  remove(id: BundleId): Promise<void>;
}>;
