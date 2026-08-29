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

// テスト戦略は docs/仕様/17_テスト戦略定義書.md 参照
// - unit: domain 純関数のユニットテスト（*.test.ts）。DBなし・高速・多数
// - integration: リポジトリ実装×実DB（*.int.test.ts）。db-test(:5433) が必要・少数
//
// ブラウザ段（*.browser.test.tsx）はここに置かず vitest.browser.config.mts が持つ（分けた理由は同ファイル）
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  test: {
    // カバレッジは補助指標（数値ゲートは設けない）。詳細はテスト戦略定義書 §7
    coverage: {
      provider: "v8",
      // json-summary（層ごとの集計）と lcovonly（行ごとの実行回数＝変更箇所カバレッジ）は
      // scripts/coverage-summary.sh が読む機械可読出力。lcov ではなく lcovonly なのは
      // 前者が HTML ツリー（coverage/lcov-report）も生成してしまうため
      reporter: ["text", "text-summary", "json-summary", "lcovonly"],
      // presentation も計測対象に含める（T-33）。コンポーネントテストで測れるように
      // なったため、含めないと T-39 の成果と UI 変更の未カバー箇所が数字に出ない。
      // include は「未実行ファイルを走査する範囲」しか制御しない点に注意——テストが
      // 読み込んだファイルは include に関係なく計上されるので、片方だけ含めると
      // 「テスト済みのファイルだけが分母に入る」非対称集計になる
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/*.int.test.ts",
        "src/**/testing/**",
        "src/**/_testing/**",
      ],
    },
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
          // `*.browser.test.ts` は命名の誤り（ブラウザ段は `.tsx`）だが、除外しないと node 環境の
          // この段が拾ってしまう。命名規約を機械で守るための1行
          exclude: ["src/**/*.int.test.ts", "src/**/*.browser.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          // コンポーネントテスト（テスト戦略定義書 §3）。jsdom を要するテストは
          // 対象が .ts（hooks 等）でも *.test.tsx に置く——拡張子が実行環境を表す
          name: "component",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          // ブラウザ段のファイルも `*.test.tsx` で終わるため、jsdom 側から明示的に外す
          exclude: ["src/**/*.browser.test.tsx"],
          setupFiles: ["./src/app/_testing/setup.ts"],
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
