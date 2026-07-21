import path from "node:path";
import { defineConfig } from "vitest/config";

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
      reporter: ["text", "text-summary"],
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
