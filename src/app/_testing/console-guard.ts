import { afterAll, beforeEach } from "vitest";

// テスト中に出た `console.error` をテスト失敗に変える（T-111）。`setup.ts` が段の前提として
// 敷き、ブラウザ段（`setup-browser.ts`）もそのまま引き継ぐ。
//
// 守るのは `interactions.ts` の `click` を `await` し忘れた取りこぼし（テスト戦略定義書 §4。
// 型でも lint でも捕まらない理由は ./interactions.ts）。React は act 警告を出すだけなので、
// これが無いと落としてもテストは緑のまま通る。
//
// **文面で選り分けず、`console.error` が出たら全部落とす**——警告文はバージョンで変わるため
// 部分一致は追随漏れがそのまま「静かな無効化」になるから。
//
// **網が掛かるのはコンポーネント段・ブラウザ段の `console.error` だけ**。`console.warn`・
// 未処理の Promise 拒否は通らず、`setupFiles` を持たない unit 段・統合段には網そのものが無い。
// jsdom の virtual console（`Not implemented: ...`）も**通らない**——差し替えるのは
// `console` のプロパティだけで、jsdom は環境の構築時に握った参照へ直接書くため（実測で確認）。
// 寄りかかりすぎないこと。
//
// この網自体が壊れていないかは ./console-guard.test.tsx が見る。

let recorded: string[] = [];

/**
 * `console.error` を記録用に差し替える。`setup.ts` から段の前提として1回だけ呼ぶ
 */
export function startConsoleErrorGuard(): void {
  install(); // 最初の `beforeEach` より前（トップレベル・`beforeAll`）の分も網に入れる
  // **テストごとに敷き直す**。テストが張った spy は `setup.ts` の `clearAllMocks` では消えない
  // （消えるのは呼び出し記録だけ）ため、敷き直さないと**1本の抑制がそのファイルの以降の網を
  // 静かに落とす**
  beforeEach(install);
  // 最後のテストの `afterEach` より後（`afterAll`・遅延タイマー・未解決 Promise）に出たものは
  // どのテストにも属さないまま捨てられる。ファイルの終わりでもう一度回収する。
  // **この1行だけはテストで守れない**（自分より後に走るものを in-band で主張できない）ため、
  // 消しても全段が緑のままになる。担保は変異とコミットメッセージの記録（§10）
  afterAll(assertNoConsoleError);
}

/**
 * 記録を取り出して空にし、1件でもあれば投げる。**`cleanup()` の後に呼ぶ**
 * ——アンマウント時に出る警告もこの網に入れるため
 */
export function assertNoConsoleError(): void {
  const messages = drainConsoleErrors();
  if (messages.length === 0) return;

  throw new Error(
    `テスト中に console.error が出力されました（テスト戦略定義書 §4）。` +
      `act のスコープが閉じていない兆候です（\`click\` の \`await\` 落ちが典型）。` +
      `直前のテストから遅れて出たものがここで回収されることもあります。` +
      `意図した出力なら expectConsoleError で受けてください（§2）。\n` +
      messages.join("\n"),
  );
}

/**
 * **意図して起こした `console.error` を記録から抜き取り、出たことを主張する**
 * （テスト戦略定義書 §2「ログは抑制するだけで終えない」）。抜き取るのは一致した分だけなので、
 * 同じテストに紛れ込んだ act 警告は残って赤くなる。
 *
 * `vi.spyOn(console, "error").mockImplementation(() => {})` でも網からは外れるが、
 * **そのテストの残り全体が無防備になり**、出たことも主張できない。こちらを使う
 */
export function expectConsoleError(pattern: string | RegExp): void {
  const remaining = recorded.filter((message) => !matches(message, pattern));
  if (remaining.length === recorded.length) {
    throw new Error(
      `console.error（${String(pattern)}）は出力されていません。` +
        `記録: ${recorded.length === 0 ? "なし" : recorded.join(" / ")}`,
    );
  }
  recorded = remaining;
}

/**
 * 記録を取り出して空にする（投げない）。**別の失敗が起きた後の後始末に使う**
 * ——記録を残したまま次のテストへ渡すと、無関係なテストが代わりに赤くなる
 */
export function drainConsoleErrors(): string[] {
  const messages = recorded;
  recorded = [];
  return messages;
}

function install(): void {
  console.error = (...args: unknown[]) => {
    recorded.push(formatArgs(args));
  };
}

// `search` を使うのは、`test` だと `/.../g` を渡されたとき `lastIndex` が持ち越されて
// 2件目以降を取りこぼすため（呼び手に「g を付けるな」を期待しない）
function matches(message: string, pattern: string | RegExp): boolean {
  return typeof pattern === "string" ? message.includes(pattern) : message.search(pattern) >= 0;
}

/**
 * React の警告は `console.error("An update to %s ...", name, stack)` のように書式文字列と
 * 実引数の並びで来るため `%s` だけ埋めて読める形にする。**`node:util` の `format` は使わない**
 * ——このファイルは実ブラウザで走るブラウザ段でも読まれる
 */
function formatArgs(args: readonly unknown[]): string {
  const [head, ...rest] = args;
  if (typeof head !== "string") return args.map(String).join(" ");

  const placeholders = head.match(/%s/g)?.length ?? 0;
  const filled = rest
    .slice(0, placeholders)
    // 置換先は文字列ではなく関数で渡す。値に含まれる `$&` 等が特殊解釈されて壊れるため
    .reduce<string>((text, value) => text.replace("%s", () => String(value)), head);
  return [filled, ...rest.slice(placeholders)].map(String).join(" ");
}
