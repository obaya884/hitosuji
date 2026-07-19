import { NextRequest, NextResponse } from "next/server";

// base64 として解釈できなければ null（呼び出し側で 401 に倒す）
function decodeBasic(encoded: string): string | null {
  try {
    return atob(encoded);
  } catch {
    return null;
  }
}

// Basic認証（N-03）。資格情報は環境変数で管理し、未設定時（ローカル開発）は認証なしで通す
export default function proxy(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !password) {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    // 不正な base64 でも 500 ではなく 401 を返す（atob は例外を投げる）
    const decoded = decodeBasic(auth.slice("Basic ".length));
    if (decoded !== null) {
      const sep = decoded.indexOf(":");
      const reqUser = decoded.slice(0, sep);
      const reqPassword = decoded.slice(sep + 1);
      if (sep !== -1 && reqUser === user && reqPassword === password) {
        return NextResponse.next();
      }
    }
  }

  return new NextResponse("認証が必要です", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="hitosuji"' },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
