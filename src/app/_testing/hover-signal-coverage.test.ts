// **ホバーの合図が直書きされていないこと**を確かめる（T-134）。
//
// 直書きは `eslint.config.mjs` の `no-restricted-syntax` が禁じている。だが同ルールは
// **options がマージされず上書きされる**ため、`src/app/**` に config をもう1つ重ねる、あるいは
// `...hoverSignalRules` のスプレッドを1つ落とすだけで、**lint もテストも緑のまま規則が死ぬ**。
// ここが見ているのは規則の適用ではなく**直書きがゼロという実態**なので、規則が死ねば直書きが
// 増えた時点で落ちる。
//
// 見るのは書いてある文字列だけ。**押せる要素が合図を落としたこと**は捕まえない——「押せる要素か」
// は静的には決まらないため（[T-149](../../../docs/案件/23_技術改善バックログ.md#t-149)）。
import { globSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

/**
 * 走査対象。合図の置き場（`ui.ts`）とその検査（`ui.test.ts`）、および禁じたい文字列を
 * パターンとして持つこの検査自身は外す。
 */
const EXCLUDED = [
  "src/app/_lib/ui.ts",
  "src/app/_lib/ui.test.ts",
  "src/app/_testing/hover-signal-coverage.test.ts",
];

const sources = globSync("src/app/**/*.{ts,tsx}", { cwd: repoRoot }).filter(
  // ブラウザ段のスクリーンショットは `__screenshots__/<テスト名>.tsx/` という **`.tsx` で終わる
  // ディレクトリ**に入るので、名前だけでは除けない
  (file) => !EXCLUDED.includes(file) && statSync(path.join(repoRoot, file)).isFile()
);

/** `eslint.config.mjs` の `HOVER_SIGNAL` と同じ。畳めるものだけを見る（アイコン・ナビは対象外） */
const DIRECT_SIGNAL = /hover:(?:no-)?underline|hover:bg-|disabled:/;

/** 行コメント・ブロックコメントの中の言及は対象外（lint も AST を見るので拾わない） */
const isComment = (line: string) => /^\s*(?:\/\/|\/?\*)/.test(line);

/**
 * `disabled: boolean` のようなプロパティ宣言を落とす。lint は文字列リテラルだけを見るので
 * 当たらないが、こちらは行を素で読むため区別がつかない。**空白の有無で分ける**——
 * クラスは `disabled:no-underline` と続き、プロパティは `:` の後に空白が入る
 */
const withoutProperties = (line: string) => line.replace(/\bdisabled:\s/g, "");

describe("ホバーの合図（画面定義書00_共通 §2.5: 直書きしない）", () => {
  it("走査対象を取りこぼしていない（この検査自体が空振りしていないこと）", () => {
    expect(sources.length).toBeGreaterThanOrEqual(100);
  });

  it("合図の直書きは、条項が認めた例外に lint を外した1か所だけ", () => {
    const direct = sources.flatMap((file) => {
      const lines = readFileSync(path.join(repoRoot, file), "utf8").split("\n");
      return lines.flatMap((line, i) => {
        if (isComment(line) || !DIRECT_SIGNAL.test(withoutProperties(line))) return [];
        // 例外は「その場で lint を外して条項を引く」形でしか書けない（00_共通 §2.5 例外1）
        if (lines[i - 1]?.includes("eslint-disable-next-line no-restricted-syntax")) return [];
        return [`${file}:${i + 1}`];
      });
    });

    expect(direct).toEqual([]);
  });
});
