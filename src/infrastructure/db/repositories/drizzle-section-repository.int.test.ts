import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { sections, tasks } from "@/infrastructure/db/schema";
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
      isDayStart: false,
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

  it("update は名前と開始時刻を書き換え、updated_at を現在時刻で埋める", async () => {
    const created = await repo.create({ name: "朝", startTime: "06:00" });

    await repo.update(created.id, { name: "早朝", startTime: "05:30" });

    const [after] = await db.select().from(sections);
    expect(after.name).toBe("早朝");
    expect(after.startTime).toBe("05:30:00");
    // updated_at はアプリ層が設定する（データモデル定義書 §3 共通カラム）。
    // 挿入時の既定値は DB の now()・更新時はアプリの new Date() で**時刻源が2つある**ため、
    // コンテナとホストの時計が数ミリ秒前後して挿入時より前になりうる（T-31）。
    // そこで大小関係は見ず「更新時に現在時刻で埋め直されている」ことだけを確かめる
    expect(Math.abs(Date.now() - after.updatedAt.getTime())).toBeLessThan(60_000);
  });

  it("setArchived はアーカイブと復元の両方に使える", async () => {
    const created = await repo.create({ name: "朝", startTime: "06:00" });
    await repo.setArchived(created.id, true);
    expect((await repo.listAll())[0].isArchived).toBe(true);

    await repo.setArchived(created.id, false);
    expect((await repo.listAll())[0].isArchived).toBe(false);
  });

  // F-116: 日界セクションは有効内でちょうど1件（部分ユニーク索引 uq_sections_day_start_active）
  it("setDayStart は1件だけ日界にし、切り替えると前の日界を下ろす", async () => {
    const morning = await repo.create({ name: "朝", startTime: "06:00" });
    const forenoon = await repo.create({ name: "午前", startTime: "09:00" });

    await repo.setDayStart(morning.id);
    const afterFirst = await repo.listAll();
    expect(afterFirst.filter((s) => s.isDayStart).map((s) => s.id)).toEqual([morning.id]);

    // 切り替え。索引を破らずに前の日界が下りることを確認する
    await repo.setDayStart(forenoon.id);
    const afterSwitch = await repo.listAll();
    expect(afterSwitch.filter((s) => s.isDayStart).map((s) => s.id)).toEqual([forenoon.id]);
  });

  it("部分ユニーク索引が有効セクション内の日界2件を拒否する", async () => {
    const morning = await repo.create({ name: "朝", startTime: "06:00" });
    const forenoon = await repo.create({ name: "午前", startTime: "09:00" });
    await repo.setDayStart(morning.id);

    // setDayStart を経由せず直接2件目を立てると索引違反で失敗する
    await expect(
      db.update(sections).set({ isDayStart: true }).where(eq(sections.id, forenoon.id))
    ).rejects.toThrow();
  });

  // 画面定義書03 §4.1: セクションの参照元はタスクのみ（ルーチンは開始想定時刻から導出する）
  it("参照件数はタスクだけを数え、参照0件のセクションは削除できる", async () => {
    const used = await repo.create({ name: "朝", startTime: "06:00" });
    const unused = await repo.create({ name: "誤作成", startTime: "07:00" });

    await db
      .insert(tasks)
      .values({ taskDate: "2026-07-20", name: "T1", sortOrder: 1000, sectionId: used.id });

    expect(await repo.referenceCounts([used.id, unused.id])).toEqual({ [used.id]: 1 });

    await repo.remove(unused.id);
    expect((await repo.listAll()).map((s) => s.id)).toEqual([used.id]);
  });
});
