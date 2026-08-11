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
  /**
   * 各バンドルに属するルーチン（＝メンバー）の件数（画面定義書05 §3.1）。0件の id は省略されうる
   * ——呼び出し側は `?? 0` で補う。`referenceCounts` と違いタスクは数えない（メンバーはルーチンの
   * 所属そのものを指す。§4.8 で展開済みタスクへ写る値は別の関心事）。無効ルーチンも数える
   * （所属は有効/無効を問わない。O-5 の「無効ルーチンも候補に出す」とは別の話）
   */
  memberCounts(ids: readonly BundleId[]): Promise<Readonly<Record<BundleId, number>>>;
  remove(id: BundleId): Promise<void>;
}>;
