// ブラウザ段（テスト戦略定義書 §3 / T-03）の前処理。コンポーネント段と共通の前提
// （next/navigation の差し替え・描画結果の後始末）はそのまま引き継ぎ、実ブラウザにしかない
// 事情だけをここで足す。**jsdom の詰め物は持ち込まない**——実ブラウザには本物がある。
import "./setup";

// next/link などが Node の `process` を直接参照する。本番では Next.js のバンドラが同等の
// 置換をするが、ブラウザ段は素の Chromium に描くので最小の shim を自前で置く
globalThis.process ??= { env: { NODE_ENV: "test" } } as typeof globalThis.process;
