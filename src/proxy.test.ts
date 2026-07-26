import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import proxy, { config } from "./proxy";

// テスト内で組み立てる架空の資格情報。実運用の値は参照しない
const TEST_USER = "unit-user";
const TEST_PASSWORD = "unit-password";

/**
 * 資格情報の環境変数を固定する（`undefined` は未設定）。
 * 片方だけ差し替えると実行環境（シェル・CI）に残った値を拾いうるため、常に2つとも書き換える。
 * 後始末は afterEach の `unstubAllEnvs` が対で行う。
 * 差し替え対象はプロセス外の設定であって協力者ではないため、古典学派の方針（§8）に反しない。
 */
function stubCredentials(user: string | undefined, password: string | undefined): void {
  vi.stubEnv("BASIC_AUTH_USER", user);
  vi.stubEnv("BASIC_AUTH_PASSWORD", password);
}

function request(authorization?: string): NextRequest {
  return new NextRequest("http://localhost:3000/", {
    headers: authorization === undefined ? undefined : { authorization },
  });
}

/**
 * ブラウザと同じ手順で base64 に符号化する（UTF-8 のバイト列にしてから base64）。
 * `btoa` は latin1 の範囲しか受け付けないため、非 ASCII は先に `TextEncoder` で符号化する
 */
function encodeBase64(decoded: string): string {
  const bytes = new TextEncoder().encode(decoded);
  return btoa(String.fromCharCode(...bytes));
}

/**
 * `Authorization` ヘッダ値。`schemePrefix` はスキーム名と区切り文字までを含む
 * （区切りが空白であること自体を検証したいテストがあるため、呼び出し側に持たせる）
 */
function authHeader(schemePrefix: string, decoded: string): string {
  return `${schemePrefix}${encodeBase64(decoded)}`;
}

/** 正しい形の `Basic` ヘッダ値 */
function basicHeader(user: string, password: string): string {
  return authHeader("Basic ", `${user}:${password}`);
}

/** 復号後の文字列を直接指定する `Basic` ヘッダ値（`:` を含まない等、正しい形でないものも渡せる） */
function basicHeaderOf(decoded: string): string {
  return authHeader("Basic ", decoded);
}

/** `NextResponse.next()` = 後続へ素通し */
function expectPassThrough(res: Response): void {
  expect(res.status).toBe(200);
  expect(res.headers.get("x-middleware-next")).toBe("1");
}

/** 401 ＋ ブラウザに再入力を促す `WWW-Authenticate` */
function expectUnauthorized(res: Response): void {
  expect(res.status).toBe(401);
  expect(res.headers.get("WWW-Authenticate")).toBe('Basic realm="hitosuji"');
  expect(res.headers.get("x-middleware-next")).toBeNull();
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("proxy（要件定義書 N-03: Basic認証は環境変数が揃っているときだけ有効）", () => {
  it("両方未設定なら認証せず素通しする（ローカル開発）", () => {
    stubCredentials(undefined, undefined);
    expectPassThrough(proxy(request()));
  });

  it("未設定なら Authorization の内容によらず素通しする（誤った資格情報でも止めない）", () => {
    // ローカル開発でブラウザに古い資格情報が残っている状況。素通しの判定は
    // 環境変数だけで決まり、ヘッダの内容を見ない
    stubCredentials(undefined, undefined);
    expectPassThrough(proxy(request(basicHeader("other-user", "other-password"))));
  });

  it("ユーザ名だけ設定なら素通しする（片方では認証を有効にしない）", () => {
    stubCredentials(TEST_USER, undefined);
    expectPassThrough(proxy(request()));
  });

  it("パスワードだけ設定なら素通しする（片方では認証を有効にしない）", () => {
    stubCredentials(undefined, TEST_PASSWORD);
    expectPassThrough(proxy(request()));
  });

  // 以下2本は現挙動の固定（characterization）。空文字を未設定と同じ「素通し」に倒すのは
  // fail-open 側の判断で、「未設定」と「空文字が入っている」を区別するかは FB-73 で方針決定待ち。
  // fail-closed に倒すと決まればこの2本が更新対象になる
  it("両方が空文字なら未設定とみなして素通しする（現挙動の固定。FB-73 で方針決定待ち）", () => {
    stubCredentials("", "");
    expectPassThrough(proxy(request()));
  });

  it("片方だけ空文字でも未設定とみなして素通しする（現挙動の固定。FB-73 で方針決定待ち）", () => {
    stubCredentials(TEST_USER, "");
    expectPassThrough(proxy(request()));
  });

  it("両方設定されていれば認証を要求する（401＋WWW-Authenticate＋本文）", async () => {
    stubCredentials(TEST_USER, TEST_PASSWORD);
    const res = proxy(request());
    expectUnauthorized(res);
    expect(await res.text()).toBe("認証が必要です");
  });
});

describe("proxy（要件定義書 N-03: 資格情報の照合）", () => {
  it("ユーザ名・パスワードが一致すれば素通しする", () => {
    stubCredentials(TEST_USER, TEST_PASSWORD);
    expectPassThrough(proxy(request(basicHeader(TEST_USER, TEST_PASSWORD))));
  });

  it("ユーザ名だけ一致しても 401 を返す", () => {
    stubCredentials(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(basicHeader(TEST_USER, `${TEST_PASSWORD}-wrong`))));
  });

  it("パスワードだけ一致しても 401 を返す", () => {
    stubCredentials(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(basicHeader(`${TEST_USER}-wrong`, TEST_PASSWORD))));
  });

  it("両方とも一致しなければ 401 を返す", () => {
    stubCredentials(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(basicHeader("other-user", "other-password"))));
  });

  it("パスワードに `:` を含んでも一致すれば素通しする（区切りは最初の `:` のみ）", () => {
    const passwordWithColon = "pa:ss:word";
    stubCredentials(TEST_USER, passwordWithColon);
    expectPassThrough(proxy(request(basicHeader(TEST_USER, passwordWithColon))));
  });

  it("非 ASCII を含む資格情報でも一致すれば素通しする（UTF-8 で復号する）", () => {
    // ブラウザは資格情報を UTF-8 で符号化して送る。latin1 で復号すると多バイト文字が
    // 元の文字へ戻らず、設定値と一致し得なくなる（照合できる文字集合が ASCII に狭まる）
    const user = "テスト利用者";
    const password = "パスワード-Ω";
    stubCredentials(user, password);
    expectPassThrough(proxy(request(basicHeader(user, password))));
  });

  it("設定のユーザ名に `:` が含まれると一致し得ない（区切りは最初の `:` のみ）", () => {
    // 送信値 "unit:user:unit-password" は ユーザ名 "unit" / パスワード "user:unit-password" と
    // 解釈されるため、設定のユーザ名 "unit:user" とは決して一致しない
    stubCredentials("unit:user", TEST_PASSWORD);
    const res = proxy(request(basicHeaderOf(`unit:user:${TEST_PASSWORD}`)));
    expectUnauthorized(res);
  });
});

describe("proxy（要件定義書 N-03: 不正な Authorization ヘッダは 401 に倒す）", () => {
  it("Basic 以外のスキームなら 401 を返す", () => {
    stubCredentials(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(authHeader("Bearer ", `${TEST_USER}:${TEST_PASSWORD}`))));
  });

  it("スキーム名の大文字小文字が異なると 401 を返す（現状の実装は `Basic ` 前方一致）", () => {
    // RFC 7617 のスキーム名は本来 case-insensitive だが、実装は完全一致で判定している。
    // 実ブラウザは `Basic` を送るため実害は無く、case-insensitive にはしない判断が出ている
    // （起票なし＝直す予定が無い。現挙動の固定）
    stubCredentials(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(authHeader("basic ", `${TEST_USER}:${TEST_PASSWORD}`))));
  });

  it("スキーム名の直後が空白でなければ 401 を返す", () => {
    // 前方一致の判定から末尾の空白が落ちると、区切りが何であれ6文字目以降を
    // base64 として読んでしまう
    stubCredentials(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(authHeader("Basic\t", `${TEST_USER}:${TEST_PASSWORD}`))));
  });

  it("base64 として解釈できない値でも例外にせず 401 を返す", () => {
    stubCredentials(TEST_USER, TEST_PASSWORD);
    // 復号器がどう振る舞っても（例外／不正文字を無視して別物を返す）、資格情報の形に
    // ならない値は 500 でも素通しでもなく 401 に倒す
    expectUnauthorized(proxy(request("Basic not-base64!!!")));
  });

  it("base64 の長さが不正（4で割った余りが1）でも例外にせず 401 を返す", () => {
    stubCredentials(TEST_USER, TEST_PASSWORD);
    // "YWJjZ" は5文字。base64 の単位（4文字）に足りない末尾を持つ
    expectUnauthorized(proxy(request("Basic YWJjZ")));
  });

  it("Basic の後ろが空でも 401 を返す", () => {
    stubCredentials(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request("Basic ")));
  });

  it("`:` を含まない値なら 401 を返す", () => {
    stubCredentials(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(basicHeaderOf(TEST_USER))));
  });

  it("`:` を含まない値は、設定値が「ユーザ名＋1文字」でも 401 を返す（区切り無しを通さない）", () => {
    // `sep === -1` を弾かないと decoded.slice(0, -1) / decoded.slice(0) が
    // それぞれユーザ名・パスワードと一致してしまう組み合わせ
    stubCredentials(TEST_USER, `${TEST_USER}X`);
    const res = proxy(request(basicHeaderOf(`${TEST_USER}X`)));
    expectUnauthorized(res);
  });
});

describe("proxy の matcher（要件定義書 N-03: 認証を通す経路の範囲）", () => {
  // Next はパス全体との一致で matcher を評価するため、前後を固定して近似する。
  // 実行時の突き合わせそのものではなく「除外パターンが何を意図しているか」を固定するテスト
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it("matcher は1件（増えたらこのテストの対象も見直す）", () => {
    expect(config.matcher).toHaveLength(1);
  });

  it.each(["/", "/settings", "/api/tasks"])("アプリの経路 %s は認証の対象にする", (pathname) => {
    expect(matcher.test(pathname)).toBe(true);
  });

  it.each(["/_next/static", "/_next/static/chunk.js", "/_next/image", "/favicon.ico"])(
    "静的アセットの経路 %s は認証の対象から外す",
    (pathname) => {
      expect(matcher.test(pathname)).toBe(false);
    }
  );

  // 除外パターンは「その名前ちょうど」か「その配下」にだけ掛かる。`.` を任意の1文字として
  // 扱ったり末尾の境界を置かなかったりすると、下の経路が静かに認証の外へ落ちる
  it.each([
    "/faviconXico", // `.` は任意の1文字ではない
    "/favicon.icon", // 除外名の後ろに続きがあれば別の経路
    "/favicon.ico.map",
    "/_next/staticX",
    "/_next/static-cache/chunk.js",
    "/_next/imagex",
    "/_nextX/static/chunk.js",
  ])("静的アセットに似た名前の経路 %s は認証の対象にする", (pathname) => {
    expect(matcher.test(pathname)).toBe(true);
  });
});
