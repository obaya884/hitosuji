// 初期データ投入（データモデル定義書 §5）。空テーブルにのみ投入する冪等スクリプト
import { config } from "dotenv";

config({ path: [".env.local", ".env"], quiet: true });

async function main() {
  const { db } = await import("./index");
  const { sections, modes } = await import("./schema");

  const existingSections = await db.select().from(sections);
  if (existingSections.length === 0) {
    await db.insert(sections).values([
      { name: "朝", startTime: "06:00" },
      { name: "午前", startTime: "09:00" },
      { name: "午後", startTime: "12:00" },
      { name: "夜", startTime: "18:00" },
      { name: "深夜", startTime: "00:00" },
    ]);
    console.log("sections: 初期データを投入しました");
  } else {
    console.log(`sections: ${existingSections.length}件存在するためスキップ`);
  }

  const existingModes = await db.select().from(modes);
  if (existingModes.length === 0) {
    await db.insert(modes).values([
      { name: "仕事", color: "#3b82f6" },
      { name: "暮らし", color: "#22c55e" },
      { name: "休憩", color: "#9ca3af" },
    ]);
    console.log("modes: 初期データを投入しました");
  } else {
    console.log(`modes: ${existingModes.length}件存在するためスキップ`);
  }

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
