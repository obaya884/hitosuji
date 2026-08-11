// 初期データ投入（データモデル定義書 §5）。空テーブルにのみ投入する冪等スクリプト
import { pathToFileURL } from "node:url";
import { COLOR_BY_NAME } from "@/domain/shared/color-presets";
import type { Database } from "./index";
import { modes, sections } from "./schema";

// 初期セクション（データモデル定義書 §5 が正）
const SEED_SECTIONS = [
  { name: "朝", startTime: "06:00" },
  { name: "午前", startTime: "09:00" },
  { name: "午後", startTime: "12:00" },
  { name: "夜", startTime: "18:00" },
  // 既定の日界セクション（1日の開始 = 深夜 0:00＝暦日と一致する。F-116）
  { name: "深夜", startTime: "00:00", isDayStart: true },
];

// 初期モード（データモデル定義書 §5 が正。色は画面定義書03 §3.2 のプリセットから引く）
const SEED_MODES = [
  { name: "仕事", color: COLOR_BY_NAME["青"] },
  { name: "暮らし", color: COLOR_BY_NAME["緑"] },
  { name: "休憩", color: COLOR_BY_NAME["グレー"] },
];

export type SeedResult = Readonly<{ sections: string; modes: string }>;

export async function seedMasters(db: Database): Promise<SeedResult> {
  const existingSections = await db.select().from(sections);
  if (existingSections.length === 0) {
    await db.insert(sections).values(SEED_SECTIONS);
  }

  const existingModes = await db.select().from(modes);
  if (existingModes.length === 0) {
    await db.insert(modes).values(SEED_MODES);
  }

  return {
    sections:
      existingSections.length === 0
        ? "初期データを投入しました"
        : `${existingSections.length}件存在するためスキップ`,
    modes:
      existingModes.length === 0
        ? "初期データを投入しました"
        : `${existingModes.length}件存在するためスキップ`,
  };
}

async function main() {
  const { config } = await import("dotenv");
  config({ path: [".env.local", ".env"], quiet: true });

  const { db } = await import("./index");
  const result = await seedMasters(db);
  console.log(`sections: ${result.sections}`);
  console.log(`modes: ${result.modes}`);
  process.exit(0);
}

// `npm run db:seed` で直接実行されたときだけ走らせる（テストからは import して使う）
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
