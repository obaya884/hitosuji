import { NextRequest, NextResponse } from "next/server";

type Credentials = Readonly<{ user: string; password: string }>;

// base64 として解釈できなければ null（呼び出し側で 401 に倒す）
function decodeBasic(encoded: string): string | null {
  try {
    return atob(encoded);
  } catch {
    return null;
  }
}

/**
 * `Authorization` ヘッダから資格情報を取り出す。`Basic <base64>` の形でない、または
 * 復号結果が `ユーザ名:パスワード` の形でなければ null（呼び出し側で 401 に倒す）。
 * 形が違うものは**分割より先にすべて弾く**ので、照合側は評価順に依存しない。
 */
function parseBasicCredentials(header: string | null): Credentials | null {
  if (!header?.startsWith("Basic ")) {
    return null;
  }
  // 不正な base64 でも 500 ではなく 401 を返す（atob は例外を投げる）
  const decoded = decodeBasic(header.slice("Basic ".length));
  if (decoded === null) {
    return null;
  }
  // 区切りが無ければ資格情報の形ではない。ここで弾かないと slice が
  // 「末尾1文字を落とした文字列」と「全体」を返し、照合を通しうる
  const sep = decoded.indexOf(":");
  if (sep === -1) {
    return null;
  }
  return { user: decoded.slice(0, sep), password: decoded.slice(sep + 1) };
}

// Basic認証（N-03）。資格情報は環境変数で管理し、未設定時（ローカル開発）は認証なしで通す
export default function proxy(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !password) {
    return NextResponse.next();
  }

  const credentials = parseBasicCredentials(req.headers.get("authorization"));
  if (credentials !== null && credentials.user === user && credentials.password === password) {
    return NextResponse.next();
  }

  return new NextResponse("認証が必要です", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="hitosuji"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
