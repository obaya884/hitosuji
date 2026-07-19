import { NextRequest, NextResponse } from "next/server";

// Basic認証（N-03）。資格情報は環境変数で管理し、未設定時（ローカル開発）は認証なしで通す
export default function proxy(req: NextRequest) {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;

  if (!user || !password) {
    return NextResponse.next();
  }

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = atob(auth.slice("Basic ".length));
    const sep = decoded.indexOf(":");
    const reqUser = decoded.slice(0, sep);
    const reqPassword = decoded.slice(sep + 1);
    if (reqUser === user && reqPassword === password) {
      return NextResponse.next();
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
