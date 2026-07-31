import { NextRequest, NextResponse } from "next/server";

const BASIC_PREFIX = "Basic ";

type Credentials = Readonly<{ user: string; password: string }>;

/**
 * `Authorization` ヘッダから資格情報を取り出す。`Basic <base64>` の形でない、または
 * 復号結果が `ユーザ名:パスワード` の形でなければ null（呼び出し側で 401 に倒す）。
 */
function parseBasicCredentials(header: string | null): Credentials | null {
  if (!header?.startsWith(BASIC_PREFIX)) {
    return null;
  }
  // ブラウザは資格情報を UTF-8 で符号化して送るため UTF-8 で復号する（照合できる文字は
  // ASCII に限られない）。`Buffer` は base64 として不正な文字を黙って捨てるだけで例外を投げず、
  // 符号化の妥当性そのものは検査しない——可否は下の形の判定と呼び出し側の厳密一致だけが決める
  const decoded = Buffer.from(header.slice(BASIC_PREFIX.length), "base64").toString("utf8");
  // 区切りが無ければ資格情報の形ではない。ここで弾かないと slice が
  // 「末尾1文字を落とした文字列」と「全体」を返し、照合を通しうる
  const sep = decoded.indexOf(":");
  if (sep === -1) {
    return null;
  }
  return { user: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
}

/**
 * 認証を要求する環境か（N-03 ①②）。`production` / `preview` の**完全一致だけ**が対象で、
 * それ以外（ローカル開発・未設定・未知の値）はすべて素通しに倒す。
 * `NODE_ENV` ではなく `VERCEL_ENV` を見るのは、`npm run build` が手元でも `NODE_ENV=production`
 * で走るため——ローカルのビルド検証で認証が有効化される事故を避ける。
 */
function requiresAuth(): boolean {
  const env = process.env.VERCEL_ENV;
  return env === "production" || env === "preview";
}

/**
 * 認証すべき環境なのに資格情報が無いときの応答。利用者側では解決できないので 401 にはしない
 * （401 は「資格情報を出せば解決しうる」の意味。N-03 ③）。応答本文には設定の状態を書かない。
 */
function respondMisconfigured(): NextResponse {
  return new NextResponse("サーバの設定に問題があります", { status: 500 });
}

/** 認証を要求する応答。ブラウザに資格情報の入力を促す */
function respondUnauthorized(): NextResponse {
  return new NextResponse("認証が必要です", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="hitosuji"' },
  });
}

// Basic認証（N-03）。認証を要求するかはデプロイ環境で決まり、資格情報の設定状態では切り替わらない
export default function proxy(req: NextRequest) {
  if (!requiresAuth()) {
    return NextResponse.next();
  }

  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  // 未設定・空文字のどちらも「照合先が無い」ことに変わりはなく、素通しさせない（N-03 ③）。
  // 500 では原因が画面に出ないため、ログだけが唯一の手がかりになる（値そのものは書かない）
  if (!user || !password) {
    console.error(
      "[proxy] 認証を要求する環境で BASIC_AUTH_USER / BASIC_AUTH_PASSWORD が未設定または空です"
    );
    return respondMisconfigured();
  }

  const credentials = parseBasicCredentials(req.headers.get("authorization"));
  if (credentials !== null && credentials.user === user && credentials.password === password) {
    return NextResponse.next();
  }

  return respondUnauthorized();
}

// 除外は先頭セグメントが「その名前ちょうど」か「その配下」のときだけ掛ける。`.` をエスケープせず
// 末尾の境界も置かないと `/faviconXico` や `/_next/staticX` まで認証の外へ落ちる（N-03 の除外は狭く保つ）。
// Next はこの値を静的リテラルとして読むため、変数や配列 join へ括り出せない
export const config = {
  matcher: ["/((?!(?:_next/static|_next/image|favicon\\.ico)(?:/|$)).*)"],
};
