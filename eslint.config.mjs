import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

// レイヤー依存方向の強制（docs/仕様/15_アーキテクチャ定義書.md §3）
// domain ← usecases ← infrastructure / presentation(src/app)
const layerRules = [
  {
    // domain: 他レイヤー・フレームワーク・DBに依存しない純粋な TypeScript のみ
    files: ["src/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/usecases/**",
                "**/infrastructure/**",
                "@/app/**",
                "next", "next/**",
                "react", "react/**", "react-dom", "react-dom/**",
                "drizzle-orm", "drizzle-orm/**",
                "pg", "pg/**",
              ],
              message:
                "domain 層は他レイヤー・フレームワーク・DBに依存できません（アーキテクチャ定義書 §3）",
            },
          ],
        },
      ],
    },
  },
  {
    // usecases: domain のみに依存。インフラは Port(IF) 経由で受け取る
    files: ["src/usecases/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/infrastructure/**",
                "@/app/**",
                "next", "next/**",
                "react", "react/**", "react-dom", "react-dom/**",
                "drizzle-orm", "drizzle-orm/**",
                "pg", "pg/**",
              ],
              message:
                "usecases 層は infrastructure/presentation に依存できません。Port(IF) を定義して実装を注入してください（アーキテクチャ定義書 §3）",
            },
          ],
        },
      ],
    },
  },
  {
    // infrastructure: presentation に依存しない
    files: ["src/infrastructure/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@/app/**"],
              message:
                "infrastructure 層は presentation(src/app) に依存できません（アーキテクチャ定義書 §3）",
            },
          ],
        },
      ],
    },
  },
];

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...layerRules,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // drizzle-kit 生成物
    "src/infrastructure/db/migrations/**",
    // git 管理外だが flat config は .gitignore を読まないので明示する。
    // `npm run dev:check` の出力先（T-37。既定の `.next` と分ける）
    ".next-check/**",
    // remember プラグインの作業ディレクトリ（`.remember/.gitignore` が `*` で全除外）
    ".remember/**",
  ]),
]);

export default eslintConfig;
