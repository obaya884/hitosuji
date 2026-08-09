import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { COLOR_BY_NAME } from "@/domain/shared/color-presets";
import { modes, sections } from "./schema";
import { seedMasters } from "./seed";
import { createTestDb, truncateAll } from "./testing/test-db";

const { db, pool } = createTestDb();

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await pool.end();
});

// 投入されるモードの色が §3.2 のプリセットに含まれることはマスタリポジトリの統合テストが持つ
// （`drizzle-mode-repository.int.test.ts`）。ここで見るのは投入の作法——何を入れ、
// **2回目に何をしないか**。何度流しても足さない・壊さないが冪等スクリプトを名乗る条件（T-60）
describe("seedMasters（データモデル定義書 §5: 空テーブルにのみ投入する冪等スクリプト）", () => {
  it("空のテーブルへ §5 のとおり投入する", async () => {
    expect(await seedMasters(db)).toEqual({
      sections: "初期データを投入しました",
      modes: "初期データを投入しました",
    });

    const seeded = await db.select().from(sections).orderBy(sections.id);
    expect(seeded.map((s) => [s.name, s.startTime])).toEqual([
      ["朝", "06:00:00"],
      ["午前", "09:00:00"],
      ["午後", "12:00:00"],
      ["夜", "18:00:00"],
      ["深夜", "00:00:00"],
    ]);
    // 日界セクション（F-116）はここが唯一の生成元。落ちても表示は既定へ静かに戻るだけなので明示的に見る
    expect(seeded.filter((s) => s.isDayStart).map((s) => s.startTime)).toEqual(["00:00:00"]);
    expect((await db.select().from(modes)).map((m) => m.name)).toEqual(["仕事", "暮らし", "休憩"]);
  });

  it("2回目は投入せず、既存行も書き換えない", async () => {
    await seedMasters(db);
    const before = {
      sections: await db.select().from(sections).orderBy(sections.id),
      modes: await db.select().from(modes).orderBy(modes.id),
    };

    expect(await seedMasters(db)).toEqual({
      sections: "5件存在するためスキップ",
      modes: "3件存在するためスキップ",
    });
    // id・作成日時ごと同じ（消して入れ直してもいない）
    expect(await db.select().from(sections).orderBy(sections.id)).toEqual(before.sections);
    expect(await db.select().from(modes).orderBy(modes.id)).toEqual(before.modes);
  });

  // セクションとモードの判定は独立している。まとめて1つの条件で見ていると、
  // 片方を手で作った状態からもう片方が投入されなくなる
  it("片方だけ埋まっているときは、空の側にだけ投入する", async () => {
    await db.insert(modes).values({ name: "手で作ったモード", color: COLOR_BY_NAME["青"] });

    expect(await seedMasters(db)).toEqual({
      sections: "初期データを投入しました",
      modes: "1件存在するためスキップ",
    });
    expect(await db.select().from(sections)).toHaveLength(5);
    expect((await db.select().from(modes)).map((m) => m.name)).toEqual(["手で作ったモード"]);
  });
});
