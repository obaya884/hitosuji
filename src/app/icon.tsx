import { ImageResponse } from "next/og";

// ファビコン（要件定義書 §2.3 / FB-17）。本番とローカルを色で見分ける。
// デザイン言語「紺の時間簿」の地色に、一本の筋（アプリ名の由来）を引く
export const size = { width: 32, height: 32 };
export const contentType = "image/png";

/** 本番だけ紺。ローカル開発は琥珀にして、同じ画面を並べたときにタブで区別できるようにする */
const isProduction = process.env.VERCEL_ENV === "production";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: isProduction ? "#1c1e26" : "#b3452e",
        }}
      >
        {/* 縦の一筋 */}
        <div style={{ width: 6, height: 20, background: "#fafaf8" }} />
      </div>
    ),
    size
  );
}
