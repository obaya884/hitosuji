import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig } from "vitest/config";

// worktree ごとのテストDB分離（T-06）: wt-new.sh が worktree 直下に生成する .env.worktree を読む。
// シェルから渡された TEST_DATABASE_URL（CI 等）が常に優先。本体ワークツリーにこのファイルは無い
const envWorktree = path.resolve(import.meta.dirname, ".env.worktree");
if (process.env.TEST_DATABASE_URL === undefined && existsSync(envWorktree)) {
  const match = readFileSync(envWorktree, "utf8").match(/^TEST_DATABASE_URL=([^\r\n]+)$/m);
  if (!match) {
    // 解析失敗のまま進むと共有 hitosuji_test へ黙ってフォールバックし、他 worktree のデータを消しうる
    throw new Error(`${envWorktree} に TEST_DATABASE_URL の行がありません`);
  }
  process.env.TEST_DATABASE_URL = match[1];
}

// テスト戦略はアーキテクチャ定義書 §8 参照
// - unit: domain 純関数のユニットテスト（*.test.ts）。DBなし・高速・多数
// - integration: リポジトリ実装×実DB（*.int.test.ts）。db-test(:5433) が必要・少数
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    // カバレッジは補助指標（数値ゲートは設けない）。詳細はアーキテクチャ定義書 §8
    coverage: {
      provider: "v8",
      // json-summary は CI のジョブサマリ生成（scripts/coverage-summary.sh）が読む機械可読出力
      reporter: ["text", "text-summary", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/**/*.test.ts", "src/**/*.int.test.ts", "src/**/testing/**"],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          exclude: ["src/**/*.int.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["src/**/*.int.test.ts"],
          globalSetup: ["./src/infrastructure/db/testing/global-setup.ts"],
          // 全テストが同一DBを共有するため直列実行（TRUNCATE リセットの干渉防止）
          fileParallelism: false,
        },
      },
    ],
  },
});
