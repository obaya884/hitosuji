// マスタを参照している行の件数（画面定義書03 §4.1 / 05 §5）。
// モード・プロジェクト・バンドルのどれも「複数テーブルの外部キー列を並列に数えて合算する」
// 同じ形なので、リポジトリごとに書き写さずここに1本だけ置く
import { count, inArray } from "drizzle-orm";
import type { PgColumn, PgTable } from "drizzle-orm/pg-core";
import type { Database } from "@/infrastructure/db";

/** 参照元。テーブルと、そのテーブルが持つマスタ id の外部キー列の組 */
export type ReferenceSource = readonly [table: PgTable, column: PgColumn];

/**
 * `ids` のそれぞれを参照している行の件数。**0件の id は結果から省く**
 * （呼び出し側＝`canDeleteMaster` / `deletableMasterIds` は `?? 0` で補う契約）
 */
export async function countReferences(
  db: Database,
  sources: readonly ReferenceSource[],
  ids: readonly number[]
): Promise<Record<number, number>> {
  if (ids.length === 0) return {};
  const target = [...ids];

  const grouped = await Promise.all(
    sources.map(([table, column]) =>
      db.select({ id: column, n: count() }).from(table).where(inArray(column, target)).groupBy(column)
    )
  );

  const counts: Record<number, number> = {};
  for (const { id, n } of grouped.flat()) {
    // 外部キー列は nullable。`inArray` に該当しない NULL 行は来ないが、型のうえでは残るので落とす
    if (typeof id !== "number") continue;
    counts[id] = (counts[id] ?? 0) + n;
  }
  return counts;
}
