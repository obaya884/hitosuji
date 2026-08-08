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

// 未設定・未分類の語彙を1か所（`src/app/_lib/unset.ts`）に閉じる（画面定義書00_共通 §2.4）。
// FB-55・FB-57 の壊れ方はどちらも「**新しい箇所が自分で語を書いた**」なので、既存の使用箇所を
// テストで固定するだけでは同じ乖離が戻る。定数を経由させることを機械で強制する。
// **記号 `-` と空欄は対象外**——`"-"` を禁止語にはできず（時刻の範囲など無関係なハイフンが多い）、
// 「空欄にしない」も構文では表せない。そこを守るのは `UnsetMark` / `UnsetTimeMark` を使うこと
// だけなので、「lint があるから記号側も安全」と読まないこと（薄色は部品が保証する。FB-93）。
// テスト・テストヘルパーは、表示される語をリテラルで主張するのが正（定数で照合すると
// 書き換えを検出できない）ので除く。**語を足すときは `_lib/unset.ts` と両方を更新する。**
const UNSET_VOCABULARY_MESSAGE =
  "未設定・未分類の語彙は src/app/_lib/unset.ts の定数を使ってください（画面定義書00_共通 §2.4。直書きは FB-57 の再発）";

/** 現語彙。**部分一致で見る**——`aria-label="モード（未設定）"` のように合成済みの1文字列でも捕まえる */
const UNSET_WORDS_LOOSE = ["未設定", "未分類", "--:--"];
/**
 * 廃語（FB-57 で「未設定」へ統一）。**完全一致で見る**——部分一致にすると「該当なしのため…」の
 * ような無関係な文まで止まる。単独の「なし」を未設定と無関係な選択肢（「繰り返し: なし」等）で
 * 使いたくなったら、禁止語から外すのではなく §2.4 の条項ごと見直す
 */
const UNSET_WORDS_EXACT = ["なし", "モードなし", "プロジェクトなし"];

/** 現語彙にメタ文字は無いが、足したときに黙って壊れないよう畳んでおく */
const toPattern = (words) =>
  words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|");
const LOOSE = toPattern(UNSET_WORDS_LOOSE);
const EXACT = toPattern(UNSET_WORDS_EXACT);

const unsetVocabularyConfig = {
  files: ["src/app/**/*.ts", "src/app/**/*.tsx"],
  ignores: [
    "src/app/_lib/unset.ts",
    "src/app/**/*.test.ts",
    "src/app/**/*.test.tsx",
    "src/app/**/_testing/**",
  ],
  // ESLint は rule options をマージせず上書きするので、`src/app` の no-restricted-syntax は
  // ここが占有する。別の構文規制を足すときはこの配列へ足す（別 config を重ねると消える）
  rules: {
    "no-restricted-syntax": [
      "error",
      // 文字列として書いた場合（`label: "未設定"` / `aria-label="モード（未設定）"` 等）。
      // 正規表現の属性マッチは文字列値にしか当たらないので、数値リテラルには誤爆しない
      { selector: `Literal[value=/${LOOSE}/]`, message: UNSET_VOCABULARY_MESSAGE },
      { selector: `Literal[value=/^(${EXACT})$/]`, message: UNSET_VOCABULARY_MESSAGE },
      // JSX の子として書いた場合（`<option value="">なし</option>`＝FB-57 の実際の犯人）。
      // 文字列リテラルではないので上のセレクタでは捕まらない
      { selector: `JSXText[value=/${LOOSE}/]`, message: UNSET_VOCABULARY_MESSAGE },
      { selector: `JSXText[value=/^\\s*(${EXACT})\\s*$/]`, message: UNSET_VOCABULARY_MESSAGE },
      // テンプレートリテラルに埋め込んだ場合（`` `${label}（未設定）` ``＝読み上げ語の組み立て。
      // FB-57 の現場そのものの形なので、ここをコピーした新しいセルが最も踏みやすい）
      { selector: `TemplateElement[value.raw=/${LOOSE}/]`, message: UNSET_VOCABULARY_MESSAGE },

      // 以下は**語ではなく形**で縛る。FB-57 の実際の壊れ方は既存の語のコピーではなく
      // **その場での発明**（「なし」「モードなし」「プロジェクトなし」が別々に生えた）で、
      // 語のリストではリストに無い語（「設定なし」等）を止められないため。
      {
        selector:
          'ObjectExpression:has(Property[key.name="id"][value.raw="null"]) > Property[key.name="label"] > Literal',
        message: `未設定の候補（id: null）のラベルは直書きせず ${"src/app/_lib/unset.ts"} の定数を使ってください（画面定義書00_共通 §2.4）`,
      },
      {
        selector:
          'JSXElement[openingElement.name.name="option"]:has(JSXAttribute[name.name="value"][value.value=""]) > JSXText',
        message:
          "未設定へ戻す <option> のラベルは直書きせず src/app/_lib/unset.ts の定数を使ってください（画面定義書00_共通 §2.4）",
      },
    ],
  },
};

// 記号（`-` / `--:--`）は「必ず薄色」が対になる（画面定義書00_共通 §2.4）。定数を直に import して
// 自前で描くと薄色を付け忘れられるので、描画は `_components/unset-mark.tsx` に閉じる（FB-93）。
// 語（「未設定」等）は色を伴わないため対象外——各画面が定数を直に使ってよい。
const unsetMarkRenderingConfig = {
  files: ["src/app/**/*.ts", "src/app/**/*.tsx"],
  ignores: ["src/app/_components/unset-mark.tsx", "src/app/_lib/unset.test.ts"],
  rules: {
    "no-restricted-imports": [
      "error",
      {
        paths: [
          {
            name: "@/app/_lib/unset",
            importNames: ["UNSET_MARK", "UNSET_TIME_MARK"],
            message:
              "記号は `_components/unset-mark.tsx` の UnsetMark / UnsetTimeMark（0分の値は DurationValue）経由で描いてください（画面定義書00_共通 §2.4）",
          },
        ],
      },
    ],
  },
};

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  ...layerRules,
  unsetVocabularyConfig,
  unsetMarkRenderingConfig,
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
