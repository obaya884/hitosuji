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

// 除外は先頭セグメントが「その名前ちょうど」か「その配下」のときだけ掛ける。`.` をエスケープせず
// 末尾の境界も置かないと `/faviconXico` や `/_next/staticX` まで認証の外へ落ちる（N-03 の除外は狭く保つ）。
// Next はこの値を静的リテラルとして読むため、変数や配列 join へ括り出せない
export const config = {
  matcher: ["/((?!(?:_next/static|_next/image|favicon\\.ico)(?:/|$)).*)"],
};
