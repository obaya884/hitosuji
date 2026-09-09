import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "../schema";

export const TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  "postgresql://hitosuji:hitosuji@localhost:5433/hitosuji_test";

export type TestDb = NodePgDatabase<typeof schema>;

// 統合テスト用の接続。テストファイルごとに作成し afterAll で pool.end() すること
export function createTestDb(): { db: TestDb; pool: Pool } {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 2 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

/**
 * どのテーブルにも実在しない id。テーブルの種類を問わず使う（不在は id 型に依らないため）。
 * **採番と衝突しない大きな値**にする——`truncateAll` が `RESTART IDENTITY` で採番を 1 へ戻すので、
 * 実在する id は常に小さい側に寄る。**`int4` の範囲は超えないこと**——超えると Postgres が
 * 22003 で投げ、「対象が無い」経路を通らずに例外で落ちる
 */
export const MISSING_ID = 999_999;

// 全テーブルを空にする（beforeEach で呼ぶ。古典学派: テスト間の状態を実DBごとリセット）
export async function truncateAll(db: TestDb): Promise<void> {
  await db.execute(
    sql`TRUNCATE TABLE tasks, routine_skips, routines, sections, modes, projects, bundles RESTART IDENTITY CASCADE`
  );
}
