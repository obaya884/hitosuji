import { NextRequest, NextResponse } from "next/server";

type Credentials = Readonly<{ user: string; password: string }>;

/**
 * `Authorization` ヘッダから資格情報を取り出す。`Basic <base64>` の形でない、または
 * 復号結果が `ユーザ名:パスワード` の形でなければ null（呼び出し側で 401 に倒す）。
 * 形が違うものは**分割より先にすべて弾く**ので、照合側は評価順に依存しない。
 */
function parseBasicCredentials(header: string | null): Credentials | null {
  if (!header?.startsWith("Basic ")) {
    return null;
  }
  // ブラウザは資格情報を UTF-8 で符号化して送るため UTF-8 で復号する（照合できる文字は
  // ASCII に限られない）。`Buffer` は base64 として解釈できない文字を無視し例外を投げないので、
  // 不正な値は 500 ではなく「区切りを持たない文字列」に落ちて下の判定で 401 になる
  const decoded = Buffer.from(header.slice("Basic ".length), "base64").toString("utf8");
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

// 除外は「その名前ちょうど」か「その配下」だけに掛ける。`.` をエスケープせず末尾の境界も
// 置かないと `/faviconXico` や `/_next/staticX` まで認証の外へ落ちる（N-03 の除外は狭く保つ）
export const config = {
  matcher: ["/((?!(?:_next/static|_next/image|favicon\\.ico)(?:/|$)).*)"],
};
