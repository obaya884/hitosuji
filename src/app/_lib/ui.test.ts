import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import * as ui from "./ui";
import { BODY_TEXT_STEPS, disabledPermanent, hoverSurface, hoverSurfaceOnAccent } from "./ui";

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
// 合図の断片も**接頭辞で引く**（`link*` / `btn*` と同じ流儀）。断片を足せば自動で検査に載る
const wordSignals = constantsNamed("hoverWord");
const surfaceSignals = constantsNamed("hoverSurface");

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
  hoverWord: "ホバーの合図だけを持つ（載せる要素が自分の段を持つ）",
  hoverSurface: "ホバーの合図だけを持つ（載せる要素が自分の段を持つ）",
  hoverSurfaceOnAccent: "ホバーの合図だけを持つ（載せる要素が自分の段を持つ）",
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

  it("SIZELESS の名前はすべて実在する（改名・削除でこの検査が空振りしない）", () => {
    const defined = classConstants(() => true).map(([name]) => name);
    expect(Object.keys(SIZELESS).filter((name) => !defined.includes(name))).toEqual([]);
  });

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
  // 部品（`link*`）と断片（`hoverWord`）に同じ規則が掛かる。`link*` は断片から組まれているので、
  // 分けて書くと同じ主張を2回することになる
  it.each([...wordLinks, ...wordSignals])("%s は語なので、ホバーで下線を出し文字色も面も変えない", (_n, cls) => {
    const tokens = cls.split(" ");
    expect(tokens).toContain("hover:underline");
    expect(tokens).not.toContainEqual(expect.stringMatching(/^hover:(text|bg)-/));
  });

  it.each([...wordLinks, ...wordSignals])("%s は保存中の無効でホバーの合図だけを消し、濃淡は変えない", (_n, cls) => {
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

  // 面の断片。`btn*` と違い**自分では地色を持たない**ので、戻し先を自分からは導けない
  // （`btn*` の検査が見ている「元の地色へ戻す」はここでは掛けられない）
  it.each(surfaceSignals)("%s は面の合図なので、背景で示し下線は出さない", (_n, cls) => {
    const tokens = cls.split(" ");
    expect(tokens).toContainEqual(expect.stringMatching(/^hover:bg-/));
    expect(tokens).toContainEqual(expect.stringMatching(/^disabled:hover:bg-/));
    expect(tokens).not.toContain("hover:underline");
    expect(tokens).not.toContainEqual(expect.stringMatching(/^disabled:(opacity-|text-)/));
  });

  // 断片は**素の見た目を持たない**のが定義。混ざると常時その見た目になり、載せた全要素へ漏れる
  // （素の `underline` を混ぜれば例外1 の見せ方が全画面の語リンクへ広がる）
  it.each([...wordSignals, ...surfaceSignals])("%s は合図だけを持つ", (_n, cls) => {
    expect(cls.split(" ").filter((token) => !/^(?:hover|disabled):/.test(token))).toEqual([]);
  });

  // 戻し先は断片ごとに一意に決まる（`ui.ts` が適用条件を書いている）。**在ることだけを見ると、
  // 保存中のホバーで面が出る／地色が消える、という条項の逆をやっても緑で通る**
  it("hoverSurface は地色を持たない要素向けなので、保存中は面を出さない", () => {
    expect(hoverSurface.split(" ")).toContain("disabled:hover:bg-transparent");
  });

  it("hoverSurfaceOnAccent は bg-accent の面向けなので、保存中は元の地色へ戻す", () => {
    expect(hoverSurfaceOnAccent.split(" ")).toContain("disabled:hover:bg-accent");
  });

  // §1.1 側の `SIZELESS` と同じ役目。**接頭辞は手書きなので、そこから外れた定数は
  // どの it.each にも載らず無検査になる**（`menuItem = "... hover:bg-accent-weak"` のような形）
  it("ホバーの合図を持つ定数は、必ず語か面のどちらかの検査に載る", () => {
    const covered = ["link", "btn", "hoverWord", "hoverSurface"];
    const uncovered = classConstants(([, cls]) => cls.includes("hover:"))
      .filter(([name]) => !covered.some((prefix) => name.startsWith(prefix)))
      .map(([name]) => name);

    expect(uncovered).toEqual([]);
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

  // 値そのものは写さない——トークンの値を変えるのは意図的な設計変更で、写せば二重記帳になる。
  // 代わりに**値どうしの関係**（序列と、行の高さの分母）を見る。計算後の大きさを実際に測るのは
  // ブラウザ段の仕事で、まだ無い（T-148）
  it("4段が 見出し・主・従・メタ の順で、大きいものから並んでいる", () => {
    const steps = declarations("");
    expect(steps.map(([step]) => step)).toEqual(["heading", "main", "sub", "meta"]);

    const rems = steps.map(([, value]) => Number.parseFloat(value));
    expect(rems).toEqual([...rems].sort((a, b) => b - a));
  });

  it("各段が行の高さも持つ（font-size だけ差し替えると行間が継承元のまま残る）", () => {
    expect(declarations("--line-height").map(([step]) => step)).toEqual(
      declarations("").map(([step]) => step)
    );
  });

  // 行の高さは `calc(<行送り> / <その段の font-size>)` の比で書く。段の値を動かしたときに
  // **分母を直し忘れる**と、行間だけが前の比のまま残る（値を写さないぶんここで塞ぐ）
  it("行の高さの分母は、その段の font-size と一致する", () => {
    // 分母は単位なしの数値（`calc(1.5 / 1)`）、font-size は `rem` 付きなので数値で突き合わせる
    const denominators = declarations("--line-height").map(([step, value]) => [
      step,
      Number.parseFloat(value.match(/calc\([^/]+\/\s*([^)]+)\)/)?.[1] ?? "NaN"),
    ]);

    expect(denominators).toEqual(
      declarations("").map(([step, value]) => [step, Number.parseFloat(value)])
    );
  });

  it("本文の受け口は見出しを除く3段（h1 は本文の中で選ぶものではない）", () => {
    const inCss = declarations("").map(([step]) => step);
    expect(BODY_TEXT_STEPS).toEqual(inCss.filter((s) => s !== "heading").map((s) => `text-${s}`));
  });
});
