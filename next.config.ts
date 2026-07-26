import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ブラウザ実機確認用の dev サーバ（`npm run dev:check`）だけ別のビルド出力先を使う（T-37）。
  // 既定の `.next` を本体の dev サーバ（:3000）と共有すると、2つの next dev が同じ場所へ
  // 書き合う。オーナーが動作確認をしている最中に browser-checker が起動する運用なので、
  // 両方が同時に立っている状況が普通に起きる
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
