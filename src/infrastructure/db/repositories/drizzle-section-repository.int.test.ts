import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sections } from "@/infrastructure/db/schema";
import { createTestDb, truncateAll } from "@/infrastructure/db/testing/test-db";
import { createSectionRepository } from "./drizzle-section-repository";

const { db, pool } = createTestDb();
const repo = createSectionRepository(db);

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await pool.end();
});

describe("DrizzleSectionRepository", () => {
  it("作成した行をドメイン表現（startTime は HH:MM）で返す", async () => {
    const created = await repo.create({ name: "朝", startTime: "06:00" });
    expect(created).toEqual({
      id: expect.any(Number),
      name: "朝",
      startTime: "06:00",
      isArchived: false,
    });
  });

  it("listAll はアーカイブ済みも含めて全件返す", async () => {
    await repo.create({ name: "朝", startTime: "06:00" });
    const forenoon = await repo.create({ name: "午前", startTime: "09:00" });
    await repo.setArchived(forenoon.id, true);

    const all = await repo.listAll();
    expect(all.map((s) => [s.name, s.isArchived])).toEqual(
      expect.arrayContaining([
        ["朝", false],
        ["午前", true],
      ])
    );
    expect(all).toHaveLength(2);
  });

  it("update は名前と開始時刻を書き換え、updated_at を進める", async () => {
    const created = await repo.create({ name: "朝", startTime: "06:00" });
    const [before] = await db.select().from(sections);

    await repo.update(created.id, { name: "早朝", startTime: "05:30" });

    const [after] = await db.select().from(sections);
    expect(after.name).toBe("早朝");
    expect(after.startTime).toBe("05:30:00");
    // updated_at はアプリ層が設定する（データモデル定義書 §3 共通カラム）。
    // 挿入時の既定値は DB 時刻なので大小比較はコンテナとホストの時計差で揺れる。更新されたことだけを見る
    expect(after.updatedAt.getTime()).not.toBe(before.updatedAt.getTime());
  });

  it("setArchived はアーカイブと復元の両方に使える", async () => {
    const created = await repo.create({ name: "朝", startTime: "06:00" });
    await repo.setArchived(created.id, true);
    expect((await repo.listAll())[0].isArchived).toBe(true);

    await repo.setArchived(created.id, false);
    expect((await repo.listAll())[0].isArchived).toBe(false);
  });
});
