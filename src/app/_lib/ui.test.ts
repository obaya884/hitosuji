import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import * as ui from "./ui";
import { BODY_TEXT_STEPS, disabledPermanent, linkAccent, linkMuted } from "./ui";

/**
 * 名前の接頭辞で対象を引く（`link*` = 語のリンク / `btn*` = 面のボタン）。手書きの一覧に
 * すると**新しく足した定数が検査から漏れる**——「定数を足すときに条項から外れないよう
 * 固定する」という下の describe の目的そのものが空振りするため、定義側から導く。
 */
const constantsNamed = (prefix: string): [string, string][] => classConstants(([name]) => name.startsWith(prefix));

/**
 * クラス文字列の定数だけを引く。`ui` には文字列でない export（`BODY_TEXT_STEPS` は配列）も
 * 混じるので、値の型で絞り込む。
 */
function classConstants(pick: (entry: [string, string]) => boolean): [string, string][] {
  return Object.entries<unknown>(ui).flatMap(([name, value]): [string, string][] =>
    typeof value === "string" && pick([name, value]) ? [[name, value]] : []
  );
}

const wordLinks = constantsNamed("link");
const surfaceButtons = constantsNamed("btn");

/**
 * 部品が自分の文字サイズを持っていることを固定する（画面定義書00_共通 §1.1「対象外」）。
 *
 * 部品は本文の4段（見出し/主/従/メタ）の外側にあるので、サイズを本文から継承させると
 * 置かれた場所によって同じ部品の大小が変わる。実際、表から `text-sub` を落とした際に
 * サイズを持たない部品（リンク・入力欄）が主段へ引き上がる退行が起きた（FB-91）。
 *
 * サイズの「値」ではなく「自分で持っていること」を見る——値は §1.1 の段の割り当てが
 * 変われば動くが、部品が自分で持つという規則は動かないため。
 *
 * **対象は「サイズを持たない側」を数え上げて決める**——持つ側を並べると、定数を足した人が
 * 一覧に足し忘れたときに黙って検査から漏れる（それは上の `constantsNamed` が避けたことと同じ）。
 */
const SIZELESS = {
  floatPanel: "面の見た目だけを持つ（中身が自分の段を持つ）",
  tableHeadRule: "罫線だけを持つ",
  disabledPermanent: "濃さだけを持つ",
  bottomCenterStack: "置き場所だけを持つ",
};

describe("ui のクラス定数（画面定義書00_共通 §1.1: 対象外の部品は自分のサイズを自分で持つ）", () => {
  it.each(classConstants(([name]) => !(name in SIZELESS)))(
    "%s は本文の段をちょうど1つ持つ",
    (_name, className) => {
      // 段の名前は定義側（`BODY_TEXT_STEPS`）から引く——ここに書き写すと、段を足したときに
      // **この検査だけが古い一覧のまま緑になる**。どの段かは問わず、1つに定まることを見る
      const steps: readonly string[] = BODY_TEXT_STEPS;
      expect(className.split(" ").filter((c) => steps.includes(c))).toHaveLength(1);
    }
  );

  it.each(Object.entries(SIZELESS))("%s はサイズを持たないのが正しい（%s）", (name) => {
    const [, className] = classConstants(([n]) => n === name)[0];
    const steps: readonly string[] = BODY_TEXT_STEPS;
    expect(className.split(" ").filter((c) => steps.includes(c))).toHaveLength(0);
  });
});

/**
 * ホバーの合図と無効の見せ方を固定する（画面定義書00_共通 §2.5）。
 *
 * クラスの「値」ではなく条項が定めた**組み合わせ**を見る——値は配色が変われば動くが、
 * 「下線と色変化を混ぜない」「保存中は合図だけ消す」という規則は動かないため。
 */
describe("ui のクラス定数（画面定義書00_共通 §2.5: 押せること・押せないことの示し方）", () => {
  it.each(wordLinks)("%s は語のリンクなので、ホバーで下線を出し文字色は変えない", (_n, cls) => {
    const tokens = cls.split(" ");
    expect(tokens).toContain("hover:underline");
    expect(tokens).not.toContainEqual(expect.stringMatching(/^hover:text-/));
  });

  it.each(wordLinks)("%s は保存中の無効でホバーの合図だけを消し、濃淡は変えない", (_n, cls) => {
    const tokens = cls.split(" ");
    expect(tokens).toContain("disabled:no-underline");
    expect(tokens).not.toContainEqual(expect.stringMatching(/^disabled:(opacity-|text-)/));
  });

  it.each(surfaceButtons)("%s は面なので背景で合図を出し、保存中はその地色へ戻す", (_n, cls) => {
    const tokens = cls.split(" ");
    // 戻し先は「元の地色」でなければ意味がないので、定数自身の `bg-*` から期待値を組む
    const base = tokens.find((token) => token.startsWith("bg-"));
    expect(base).toBeDefined();
    expect(tokens).toContainEqual(expect.stringMatching(/^hover:bg-/));
    expect(tokens).toContain(`disabled:hover:${base}`);
  });

  it.each(surfaceButtons)("%s は面なので下線を出さず、保存中も濃淡を変えない", (_n, cls) => {
    const tokens = cls.split(" ");
    expect(tokens).not.toContain("hover:underline");
    expect(tokens).not.toContainEqual(expect.stringMatching(/^disabled:(opacity-|text-)/));
  });

  it("恒久的な無効は不透明度だけで表す（文字色を流用せず、擬似クラスにも載せない）", () => {
    expect(disabledPermanent).toMatch(/^opacity-\d+$/);
  });
});

/**
 * 段のトークンは **CSS 側（`globals.css` の `@theme`）と TS 側（`BODY_TEXT_STEPS`）の2か所**にある。
 * 片方だけ動くと黙ってずれる——CSS に段を足しても受け口は知らないままで、CSS から段を消しても
 * 受け口は在ると言い続ける。どちらも「書いてあること」なので、実体を読んで突き合わせる。
 */
describe("文字サイズのトークン（画面定義書00_共通 §1.1）", () => {
  // **コメントを落としてから走査する**——`/* */` で囲むだけの変異は「消す」より起きやすいのに、
  // 素の文字列で探すと囲まれた宣言まで「在る」と数えてしまう
  const css = readFileSync(path.join(import.meta.dirname, "../globals.css"), "utf8").replace(
    /\/\*[\s\S]*?\*\//g,
    ""
  );

  /** `--text-<段><接尾>: <値>;` を宣言順に読む */
  const declarations = (suffix: string): [string, string][] =>
    [...css.matchAll(new RegExp(`--text-([a-z]+)${suffix}:\\s*([^;]+);`, "g"))].map(
      ([, step, value]) => [step, value.trim()]
    );

  it("Tailwind 既定の文字サイズを潰している（4段の外がビルドで生成されない前提）", () => {
    expect(css).toMatch(/^\s*--text-\*:\s*initial;/m);
  });

  it("4段が 見出し・主・従・メタ の値で定義されている（並びは大きい順に読ませる約束）", () => {
    expect(declarations("")).toEqual([
      ["heading", "1.125rem"],
      ["main", "1rem"],
      ["sub", "0.875rem"],
      ["meta", "0.75rem"],
    ]);
  });

  it("各段が行の高さも持つ（font-size だけ差し替えると行間が継承元のまま残る）", () => {
    expect(declarations("--line-height")).toEqual([
      ["heading", "calc(1.75 / 1.125)"],
      ["main", "calc(1.5 / 1)"],
      ["sub", "calc(1.25 / 0.875)"],
      ["meta", "calc(1 / 0.75)"],
    ]);
  });

  it("本文の受け口は見出しを除く3段（h1 は本文の中で選ぶものではない）", () => {
    const inCss = declarations("").map(([step]) => step);
    expect(BODY_TEXT_STEPS).toEqual(inCss.filter((s) => s !== "heading").map((s) => `text-${s}`));
  });
});
