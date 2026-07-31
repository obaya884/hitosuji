import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import proxy, { config } from "./proxy";

// テスト内で組み立てる架空の資格情報。実運用の値は参照しない
const TEST_USER = "unit-user";
const TEST_PASSWORD = "unit-password";

/**
 * デプロイ環境と資格情報の環境変数を固定する（`undefined` は未設定）。
 * 片方だけ差し替えると実行環境（シェル・CI）に残った値を拾いうるため、常に3つとも書き換える。
 * 後始末は afterEach の `unstubAllEnvs` が対で行う。
 * 差し替え対象はプロセス外の設定であって協力者ではないため、古典学派の方針（テスト戦略定義書 §1）に反しない。
 */
function stubEnv(
  vercelEnv: string | undefined,
  user: string | undefined,
  password: string | undefined
): void {
  vi.stubEnv("VERCEL_ENV", vercelEnv);
  vi.stubEnv("BASIC_AUTH_USER", user);
  vi.stubEnv("BASIC_AUTH_PASSWORD", password);
}

/**
 * 認証を要求する環境（Vercel の本番デプロイ）を前提に資格情報を固定する。
 * 環境そのものを主張するテスト以外はすべてこの前提に立つ——ローカル相当では照合に到達しないため。
 */
function stubDeployedEnv(user: string | undefined, password: string | undefined): void {
  stubEnv("production", user, password);
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

/**
 * 500 ＝ 設定の失敗（N-03 ③）。**認証ダイアログを出さない**ことまで見る——
 * `WWW-Authenticate` が付くと、利用者が資格情報を入れ直せば直ると誤解させる
 */
function expectMisconfigured(res: Response): void {
  expect(res.status).toBe(500);
  expect(res.headers.get("WWW-Authenticate")).toBeNull();
  expect(res.headers.get("x-middleware-next")).toBeNull();
}

/** 設定の失敗が出すサーバログ（N-03 ③）を受け止める。出力を汚さず、内容も検査できるようにする */
function spyOnErrorLog() {
  return vi.spyOn(console, "error").mockImplementation(() => {});
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("proxy（要件定義書 N-03 ①②: 認証を要求するかはデプロイ環境で決まる）", () => {
  // 判定は `VERCEL_ENV` だけで決まり、資格情報の設定状態では切り替わらない。
  // 以下のローカル相当の3本は**資格情報が揃っていても素通しする**ことを主張しており、
  // 「値が入っていれば認証が有効になる」という旧方式へ戻ると落ちる
  it("VERCEL_ENV が未設定なら、資格情報が揃っていても素通しする（ローカル開発）", () => {
    stubEnv(undefined, TEST_USER, TEST_PASSWORD);
    expectPassThrough(proxy(request()));
  });

  it("VERCEL_ENV が未設定なら、Authorization の内容によらず素通しする（誤った資格情報でも止めない）", () => {
    // ローカル開発でブラウザに古い資格情報が残っている状況。素通しの判定はヘッダを見ない
    stubEnv(undefined, TEST_USER, TEST_PASSWORD);
    expectPassThrough(proxy(request(basicHeader("other-user", "other-password"))));
  });

  it("VERCEL_ENV が未設定なら、資格情報が片方だけでも素通しする（ローカルでは資格情報を読まない）", () => {
    stubEnv(undefined, TEST_USER, undefined);
    expectPassThrough(proxy(request()));
  });

  // 判定は既知の2値の**完全一致**で、当てはまらない値はすべて素通しに倒す（現挙動の固定）。
  // `""` を素通しにするのは資格情報側（空文字＝欠損として 500）と扱いが逆になるが、
  // 環境名は「Vercel が入れた値かどうか」の判定であって設定値ではないため
  it.each(["development", "", "Production", "staging"])(
    "VERCEL_ENV が %o なら素通しする",
    (vercelEnv) => {
      stubEnv(vercelEnv, TEST_USER, TEST_PASSWORD);
      expectPassThrough(proxy(request()));
    }
  );

  it("VERCEL_ENV が production なら認証を要求する（401＋WWW-Authenticate＋本文）", async () => {
    stubEnv("production", TEST_USER, TEST_PASSWORD);
    const res = proxy(request());
    expectUnauthorized(res);
    expect(await res.text()).toBe("認証が必要です");
  });

  // preview は production と同格に扱う（N-03 ①）。3経路とも見ておかないと、
  // 「preview は照合せず常に 401」のような差別化が入っても気づけない
  it("VERCEL_ENV が preview でも認証を要求する（PR ごとの公開 URL を素通しさせない）", () => {
    stubEnv("preview", TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request()));
  });

  it("VERCEL_ENV が preview でも、一致する資格情報なら通す", () => {
    stubEnv("preview", TEST_USER, TEST_PASSWORD);
    expectPassThrough(proxy(request(basicHeader(TEST_USER, TEST_PASSWORD))));
  });

  it("VERCEL_ENV が preview でも、資格情報が欠けていれば 500", () => {
    spyOnErrorLog();
    stubEnv("preview", undefined, undefined);
    expectMisconfigured(proxy(request()));
  });
});

describe("proxy（要件定義書 N-03 ③: 認証を要求する環境で資格情報が欠けていれば 500）", () => {
  // 未設定・空文字のどちらも「照合先が無い」ことに変わりはなく、素通しさせない（FB-73）。
  // 401 にしないのは、利用者が何を送っても解決できない状態だから——設定ミスと
  // パスワード間違いを見分けられなくなる
  beforeEach(() => {
    spyOnErrorLog();
  });

  // 各変数が「未設定 / 空文字 / 値あり」の3状態で、欠損は6通り。`!user || !password` は
  // 対称に扱うので、鏡像まで並べて表として読めるようにしておく
  it.each([
    ["両方とも未設定", undefined, undefined],
    ["両方とも空文字", "", ""],
    ["ユーザ名だけ未設定", undefined, TEST_PASSWORD],
    ["ユーザ名だけ空文字", "", TEST_PASSWORD],
    ["パスワードだけ未設定", TEST_USER, undefined],
    ["パスワードだけ空文字", TEST_USER, ""],
  ])("%s なら 500 で止める", (_label, user, password) => {
    stubDeployedEnv(user, password);
    expectMisconfigured(proxy(request()));
  });

  it("一致しうる資格情報を送っても 500 のまま（照合に進まない）", () => {
    stubDeployedEnv("", "");
    expectMisconfigured(proxy(request(basicHeader("", ""))));
  });

  it("応答本文に設定の状態を書かない（公開 URL へ内部の事情を漏らさない）", async () => {
    stubDeployedEnv(undefined, undefined);
    const res = proxy(request());
    expect(await res.text()).toBe("サーバの設定に問題があります");
  });

  // 500 は画面に原因を出さないので、ログだけが唯一の手がかりになる（N-03 ③）
  it("原因をサーバログへ1回だけ出す", () => {
    stubDeployedEnv(undefined, undefined);
    proxy(request());
    expect(vi.mocked(console.error)).toHaveBeenCalledTimes(1);
  });

  it("ログに資格情報の値を書かない（本リポジトリは public。値は Sensitive 扱い）", () => {
    stubDeployedEnv(TEST_USER, "");
    proxy(request());
    const logged = vi.mocked(console.error).mock.calls.flat().join(" ");
    expect(logged).not.toContain(TEST_USER);
  });

  it("ローカル開発では資格情報が欠けていても 500 にせず素通しする（環境の判定が先）", () => {
    stubEnv(undefined, undefined, undefined);
    expectPassThrough(proxy(request()));
  });
});

describe("proxy（要件定義書 N-03: 資格情報の照合）", () => {
  it("ユーザ名・パスワードが一致すれば素通しする", () => {
    stubDeployedEnv(TEST_USER, TEST_PASSWORD);
    expectPassThrough(proxy(request(basicHeader(TEST_USER, TEST_PASSWORD))));
  });

  it("照合の成否にかかわらずサーバログは出さない（ログは設定の失敗だけの合図）", () => {
    const errorLog = spyOnErrorLog();
    stubDeployedEnv(TEST_USER, TEST_PASSWORD);

    proxy(request(basicHeader(TEST_USER, TEST_PASSWORD)));
    proxy(request(basicHeader(TEST_USER, "wrong")));

    expect(errorLog).not.toHaveBeenCalled();
  });

  it("ユーザ名だけ一致しても 401 を返す", () => {
    stubDeployedEnv(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(basicHeader(TEST_USER, `${TEST_PASSWORD}-wrong`))));
  });

  it("パスワードだけ一致しても 401 を返す", () => {
    stubDeployedEnv(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(basicHeader(`${TEST_USER}-wrong`, TEST_PASSWORD))));
  });

  it("両方とも一致しなければ 401 を返す", () => {
    stubDeployedEnv(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(basicHeader("other-user", "other-password"))));
  });

  it("パスワードに `:` を含んでも一致すれば素通しする（区切りは最初の `:` のみ）", () => {
    const passwordWithColon = "pa:ss:word";
    stubDeployedEnv(TEST_USER, passwordWithColon);
    expectPassThrough(proxy(request(basicHeader(TEST_USER, passwordWithColon))));
  });

  it("非 ASCII を含む資格情報でも一致すれば素通しする（UTF-8 で復号する）", () => {
    // ブラウザは資格情報を UTF-8 で符号化して送る。latin1 で復号すると多バイト文字が
    // 元の文字へ戻らず、設定値と一致し得なくなる（照合できる文字集合が ASCII に狭まる）
    const user = "テスト利用者";
    const password = "パスワード-Ω";
    stubDeployedEnv(user, password);
    expectPassThrough(proxy(request(basicHeader(user, password))));
  });

  it("設定のユーザ名に `:` が含まれると一致し得ない（区切りは最初の `:` のみ）", () => {
    // 送信値 "unit:user:unit-password" は ユーザ名 "unit" / パスワード "user:unit-password" と
    // 解釈されるため、設定のユーザ名 "unit:user" とは決して一致しない
    stubDeployedEnv("unit:user", TEST_PASSWORD);
    const res = proxy(request(basicHeaderOf(`unit:user:${TEST_PASSWORD}`)));
    expectUnauthorized(res);
  });
});

describe("proxy（要件定義書 N-03: 不正な Authorization ヘッダは 401 に倒す）", () => {
  it("Basic 以外のスキームなら 401 を返す", () => {
    stubDeployedEnv(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(authHeader("Bearer ", `${TEST_USER}:${TEST_PASSWORD}`))));
  });

  it("スキーム名の大文字小文字が異なると 401 を返す（現状の実装は `Basic ` 前方一致）", () => {
    // RFC 7617 のスキーム名は本来 case-insensitive だが、実装は完全一致で判定している。
    // 実ブラウザは `Basic` を送るため実害は無く、case-insensitive にはしない判断が出ている
    // （起票なし＝直す予定が無い。現挙動の固定）
    stubDeployedEnv(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(authHeader("basic ", `${TEST_USER}:${TEST_PASSWORD}`))));
  });

  it("スキーム名の直後が空白でなければ 401 を返す", () => {
    // 前方一致の判定から末尾の空白が落ちると、区切りが何であれ6文字目以降を
    // base64 として読んでしまう
    stubDeployedEnv(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(authHeader("Basic\t", `${TEST_USER}:${TEST_PASSWORD}`))));
  });

  it("base64 として解釈できない値でも 500 にせず 401 を返す", () => {
    stubDeployedEnv(TEST_USER, TEST_PASSWORD);
    // 復号器は不正な文字を黙って捨てるので、残りは資格情報の形にならず 401 に落ちる
    expectUnauthorized(proxy(request("Basic not-base64!!!")));
  });

  it("base64 の長さが不正（4で割った余りが1）でも 500 にせず 401 を返す", () => {
    stubDeployedEnv(TEST_USER, TEST_PASSWORD);
    // "YWJjZ" は5文字。単位に足りない末尾は捨てられ "abc" に復号されるため、区切りが無く 401
    expectUnauthorized(proxy(request("Basic YWJjZ")));
  });

  it("Basic の後ろが空でも 401 を返す", () => {
    stubDeployedEnv(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request("Basic ")));
  });

  it("`:` を含まない値なら 401 を返す", () => {
    stubDeployedEnv(TEST_USER, TEST_PASSWORD);
    expectUnauthorized(proxy(request(basicHeaderOf(TEST_USER))));
  });

  it("`:` を含まない値は、設定値が「ユーザ名＋1文字」でも 401 を返す（区切り無しを通さない）", () => {
    // `sep === -1` を弾かないと decoded.slice(0, -1) / decoded.slice(0) が
    // それぞれユーザ名・パスワードと一致してしまう組み合わせ
    stubDeployedEnv(TEST_USER, `${TEST_USER}X`);
    const res = proxy(request(basicHeaderOf(`${TEST_USER}X`)));
    expectUnauthorized(res);
  });
});

describe("proxy（要件定義書 N-03: 復号は base64 の妥当性を検査しない）", () => {
  // 現挙動の固定（characterization）。復号器は不正な文字を黙って捨てるため、`atob` 時代は
  // 例外＝401 だった「不正文字混じり」が復号を通る。資格情報を知らなければ通れないので
  // 権限は広がらないが、「何を 401 にするか」の輪郭が変わった点を記録する。
  // 厳格に弾く（fail-closed）へ倒すかは挙動レベルの仕様判断なので docs 側で決める
  it("base64 に不正な文字が混じっていても、復号結果が一致すれば素通しする", () => {
    stubDeployedEnv(TEST_USER, TEST_PASSWORD);
    expectPassThrough(proxy(request(`${basicHeader(TEST_USER, TEST_PASSWORD)}!!!`)));
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

  // 実装側コメントの「除外は先頭セグメントの名前ちょうどか、その配下だけ」を経路で固定する
  it.each([
    "/faviconXico", // `.` は任意の1文字ではない
    "/favicon.icon", // 除外名の後ろに続きがあれば別の経路
    "/favicon.ico.map",
    "/_next/staticX",
    "/_next/static-cache/chunk.js",
    "/_next/imagex",
    "/_nextX/static/chunk.js",
    "/blog/favicon.ico", // 除外名が途中のセグメントに現れても掛からない
    "/docs/_next/static/chunk.js",
    "/settings/_next/image",
  ])("静的アセットに似た名前の経路 %s は認証の対象にする", (pathname) => {
    expect(matcher.test(pathname)).toBe(true);
  });
});
