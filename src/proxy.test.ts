import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import proxy, { config } from "./proxy";

// テスト内で組み立てる架空の資格情報。実運用の値は参照しない
const USER = "unit-user";
const PASSWORD = "unit-password";

/**
 * 資格情報の環境変数を固定する（`undefined` は未設定）。
 * 片方だけ差し替えると実行環境に残った値を拾いうるため、常に2つとも書き換える。
 * 後始末は afterEach の `unstubAllEnvs` が対で行う。
 */
function stubCredentials(user: string | undefined, password: string | undefined): void {
  vi.stubEnv("BASIC_AUTH_USER", user);
  vi.stubEnv("BASIC_AUTH_PASSWORD", password);
}

function requestWith(authorization?: string): NextRequest {
  return new NextRequest("http://localhost:3000/", {
    headers: authorization === undefined ? undefined : { authorization },
  });
}

/** `user:password` を base64 化した `Authorization` ヘッダ値 */
function basicHeader(user: string, password: string): string {
  return `Basic ${btoa(`${user}:${password}`)}`;
}

/** 生の文字列（`:` を含まない等、正しい形でないものも渡せる）を base64 化した値 */
function rawBasicHeader(decoded: string): string {
  return `Basic ${btoa(decoded)}`;
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

describe("proxy（N-03: Basic認証は環境変数が揃っているときだけ有効）", () => {
  it("両方未設定なら認証せず素通しする（ローカル開発）", () => {
    stubCredentials(undefined, undefined);
    expectPassThrough(proxy(requestWith()));
  });

  it("ユーザ名だけ設定なら素通しする（片方では認証を有効にしない）", () => {
    stubCredentials(USER, undefined);
    expectPassThrough(proxy(requestWith()));
  });

  it("パスワードだけ設定なら素通しする（片方では認証を有効にしない）", () => {
    stubCredentials(undefined, PASSWORD);
    expectPassThrough(proxy(requestWith()));
  });

  it("空文字の設定は未設定とみなして素通しする", () => {
    stubCredentials("", "");
    expectPassThrough(proxy(requestWith()));
  });

  it("両方設定されていれば認証を要求する（資格情報なしのアクセスを止める）", () => {
    stubCredentials(USER, PASSWORD);
    expectUnauthorized(proxy(requestWith()));
  });
});

describe("proxy（N-03: 資格情報の照合）", () => {
  it("ユーザ名・パスワードが一致すれば素通しする", () => {
    stubCredentials(USER, PASSWORD);
    expectPassThrough(proxy(requestWith(basicHeader(USER, PASSWORD))));
  });

  it("ユーザ名だけ一致しても 401 を返す", () => {
    stubCredentials(USER, PASSWORD);
    expectUnauthorized(proxy(requestWith(basicHeader(USER, `${PASSWORD}-wrong`))));
  });

  it("パスワードだけ一致しても 401 を返す", () => {
    stubCredentials(USER, PASSWORD);
    expectUnauthorized(proxy(requestWith(basicHeader(`${USER}-wrong`, PASSWORD))));
  });

  it("両方とも一致しなければ 401 を返す", () => {
    stubCredentials(USER, PASSWORD);
    expectUnauthorized(proxy(requestWith(basicHeader("other-user", "other-password"))));
  });

  it("パスワードに `:` を含んでも一致すれば素通しする（区切りは最初の `:` のみ）", () => {
    const passwordWithColon = "pa:ss:word";
    stubCredentials(USER, passwordWithColon);
    expectPassThrough(proxy(requestWith(basicHeader(USER, passwordWithColon))));
  });

  it("ユーザ名側に `:` を送っても、最初の `:` で切られるため 401 を返す", () => {
    // 送信値 "unit:user:unit-password" は ユーザ名 "unit" / パスワード "user:unit-password" と解釈される
    stubCredentials("unit:user", PASSWORD);
    expectUnauthorized(proxy(requestWith(rawBasicHeader(`unit:user:${PASSWORD}`))));
  });
});

describe("proxy（N-03: 不正な Authorization ヘッダは 401 に倒す）", () => {
  it("Authorization ヘッダが無ければ 401 と WWW-Authenticate を返す", async () => {
    stubCredentials(USER, PASSWORD);
    const res = proxy(requestWith());
    expectUnauthorized(res);
    expect(await res.text()).toBe("認証が必要です");
  });

  it("Basic 以外のスキームなら 401 を返す", () => {
    stubCredentials(USER, PASSWORD);
    expectUnauthorized(proxy(requestWith(`Bearer ${btoa(`${USER}:${PASSWORD}`)}`)));
  });

  it("スキーム名の大文字小文字が異なると 401 を返す（現状の実装は `Basic ` 前方一致）", () => {
    // RFC 7617 のスキーム名は本来 case-insensitive だが、実装は完全一致で判定している
    stubCredentials(USER, PASSWORD);
    expectUnauthorized(proxy(requestWith(`basic ${btoa(`${USER}:${PASSWORD}`)}`)));
  });

  it("base64 として解釈できない値でも例外にせず 401 を返す", () => {
    stubCredentials(USER, PASSWORD);
    expect(() => proxy(requestWith("Basic not-base64!!!"))).not.toThrow();
    expectUnauthorized(proxy(requestWith("Basic not-base64!!!")));
  });

  it("base64 の長さが不正（4で割った余りが1）でも例外にせず 401 を返す", () => {
    stubCredentials(USER, PASSWORD);
    // "YWJjZ" は5文字。atob は長さ不正として例外を投げる
    expect(() => proxy(requestWith("Basic YWJjZ"))).not.toThrow();
    expectUnauthorized(proxy(requestWith("Basic YWJjZ")));
  });

  it("Basic の後ろが空でも 401 を返す", () => {
    stubCredentials(USER, PASSWORD);
    expectUnauthorized(proxy(requestWith("Basic ")));
  });

  it("`:` を含まない値なら 401 を返す", () => {
    stubCredentials(USER, PASSWORD);
    expectUnauthorized(proxy(requestWith(rawBasicHeader(USER))));
  });

  it("`:` を含まない値は、設定値が「ユーザ名＋1文字」でも 401 を返す（区切り無しを通さない）", () => {
    // `sep === -1` を弾かないと decoded.slice(0, -1) / decoded.slice(0) が
    // それぞれユーザ名・パスワードと一致してしまう組み合わせ
    stubCredentials(USER, `${USER}X`);
    expectUnauthorized(proxy(requestWith(rawBasicHeader(`${USER}X`))));
  });
});

describe("proxy の matcher（認証を通す経路の範囲）", () => {
  const matcher = new RegExp(`^${config.matcher[0]}$`);

  it.each(["/", "/settings", "/api/tasks"])("アプリの経路 %s は認証の対象にする", (pathname) => {
    expect(matcher.test(pathname)).toBe(true);
  });

  it.each(["/_next/static/chunk.js", "/_next/image", "/favicon.ico"])(
    "静的アセットの経路 %s は認証の対象から外す",
    (pathname) => {
      expect(matcher.test(pathname)).toBe(false);
    }
  );
});
