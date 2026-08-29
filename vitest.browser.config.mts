import path from "node:path";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";

// ブラウザテスト段（テスト戦略定義書 §3 / T-03）。jsdom はレイアウト計算をせず
// offsetHeight・getBoundingClientRect() が常に 0 を返すため、幾何・スクロールに依存する
// 判定は実ブラウザでしか測れない。`npm run test:browser` と CI の browser ジョブが回す。
//
// メインの vitest.config.mts に project として並べず設定ごと分けてあるのは、この段だけが
// Chromium バイナリ（npx playwright install chromium）を前提にするため。並べると
// `npm test` と test:coverage の双方に除外指定が要り、足し忘れるとバイナリの無い環境
// （clean clone・wt:new した worktree）で全テストがこける。
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "src") },
  },
  // **列挙は省けない**。挙げ漏らすと vite が実行の**最中**に依存を見つけて再最適化し、
  // ページをリロードしてテストの import を失敗させる（「Vite unexpectedly reloaded a test」）。
  // キャッシュが温まった環境では再現しないぶん、CI と clean clone だけが落ちる形になる。
  // drizzle-orm・pg が並ぶのは、盤面のテストが辿る `../actions`（`vi.mock` で差し替える側）が
  // 静的にはサーバの実装まで繋がっているため——走らせはしないが、走査の対象にはなる
  optimizeDeps: {
    include: [
      "next/navigation",
      "next/link",
      "next/cache",
      "drizzle-orm",
      "drizzle-orm/node-postgres",
      "drizzle-orm/pg-core",
      "pg",
    ],
  },
  test: {
    name: "browser",
    include: ["src/**/*.browser.test.tsx"],
    setupFiles: ["./src/app/_testing/setup-browser.ts"],
    browser: {
      enabled: true,
      provider: playwright(),
      // ローカルでも既定は headless。目で見たいときだけ
      // `npm run test:browser -- --browser.headless=false` で上書きする
      headless: true,
      instances: [
        {
          browser: "chromium",
          // browser mode の既定は 414x896（モバイル幅）。本アプリはデスクトップ利用が前提
          // （スマホ対応 N-09 は未実施）なので、実運用に近い大きさを段の既定に置く。
          // 特定の幅を主張するテストはその場で viewport を変える
          viewport: { width: 1280, height: 800 },
        },
      ],
    },
  },
});
