// **本文に4段の外の文字サイズが書かれていないこと**を確かめる（T-120）。
//
// 00_共通 §1.1 の「4段の外のサイズは書けない」を支えているのは、`globals.css` が Tailwind 既定の
// `--text-*` を潰していることだけ。だがこれは**ビルドがクラスを生成しなくなる**だけで、書いた側は
// 何のエラーも受け取らない——サイズ指定が消えて祖先の段へ静かに引き上がるので、FB-91 で実際に
// 起きた退行とまったく同じ形になる。トークンを潰しても素通りする書き方（任意値・インライン
// スタイル）も同じ穴を開けるため、ここでまとめて塞ぐ。
//
// 見るのは**書いてある文字列**だけ。継承の結果（祖先のサイズで配下の主が黙って動く）は
// 静的には捉えられないので対象外（[T-148](../../../docs/案件/23_技術改善バックログ.md#t-148)）。
import { globSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(import.meta.dirname, "../../..");

/** 走査対象。**この検査自身は外す**——禁じたい書き方をパターンとして持っているため */
const SELF = "src/app/_testing/text-step-coverage.test.ts";

const sources = globSync("src/app/**/*.{ts,tsx}", { cwd: repoRoot }).filter(
  // ディレクトリも拾う——ブラウザ段のスクリーンショットは `__screenshots__/<テスト名>.tsx/` という
  // **`.tsx` で終わるディレクトリ**に入るので、名前だけで除けず `statSync` で確かめる
  (file) => file !== SELF && statSync(path.join(repoRoot, file)).isFile()
);

const read = (file: string) => readFileSync(path.join(repoRoot, file), "utf8");

/** 4段の外を指す書き方。どれも lint も build も止めずに通る */
const FORBIDDEN = [
  {
    what: "Tailwind 既定の段",
    why: "トークンを潰したのでクラスが生成されず、サイズ指定が黙って消える",
    pattern: /\btext-(?:xs|sm|base|lg|[2-9]?xl)\b/g,
  },
  { what: "任意値", why: "段の外側の値を直に書ける", pattern: /\btext-\[/g },
  { what: "任意のカスタムプロパティ", why: "同上", pattern: /\btext-\(length:/g },
  { what: "インラインスタイル", why: "トークンを迂回する", pattern: /\bfontSize\b/g },
];

describe("本文の文字サイズ（画面定義書00_共通 §1.1: 4段の外のサイズは書けない）", () => {
  it("走査対象を取りこぼしていない（この検査自体が空振りしていないこと）", () => {
    expect(sources.length).toBeGreaterThanOrEqual(100);
  });

  it.each(FORBIDDEN)("$what は使われていない（$why）", ({ pattern }) => {
    const hits = sources.flatMap((file) =>
      (read(file).match(pattern) ?? []).map((text) => `${file}: ${text}`)
    );

    expect(hits).toEqual([]);
  });

  // 見出し段は本文の受け口（`BODY_TEXT_STEPS`）の外にあるので、`ui.test.ts` のどの検査にも
  // 掛からない。h1 が段を落として本文と同じ大きさへ縮む経路をここで塞ぐ
  it("画面見出し（h1）は見出し段を明示している", () => {
    const naked = sources.flatMap((file) =>
      [...read(file).matchAll(/<h1[^>]*>/g)]
        .filter(([tag]) => !tag.includes("text-heading"))
        .map(([tag]) => `${file}: ${tag}`)
    );

    expect(naked).toEqual([]);
  });
});
