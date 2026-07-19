import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Next.js dev のホットリロードで Pool が増殖しないよう globalThis にキャッシュする
const globalForDb = globalThis as unknown as { pool?: Pool };

const pool =
  globalForDb.pool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 5,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.pool = pool;
}

// リポジトリ実装が受け取る接続の型（本番の db とテスト用接続の共通型）
export type Database = NodePgDatabase<typeof schema>;

export const db = drizzle(pool, { schema });
