import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";
import { TEST_DATABASE_URL } from "./test-db";

// 統合テスト開始前にテスト用DB（docker compose の db-test）へ実マイグレーションを適用する
export default async function setup(): Promise<void> {
  const pool = new Pool({ connectionString: TEST_DATABASE_URL, max: 1 });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: "src/infrastructure/db/migrations",
    });
  } catch (e) {
    throw new Error(
      `テスト用DBへのマイグレーション適用に失敗しました。db-test は起動していますか？（docker compose up -d db-test）\n${String(e)}`
    );
  } finally {
    await pool.end();
  }
}
