import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { createTestDb, truncateAll } from "@/infrastructure/db/testing/test-db";
import { createProjectRepository } from "./drizzle-project-repository";

const { db, pool } = createTestDb();
const repo = createProjectRepository(db);

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await pool.end();
});

describe("DrizzleProjectRepository", () => {
  it("作成・一覧・更新・アーカイブが往復する", async () => {
    const created = await repo.create({ name: "引越し" });
    expect(created).toEqual({ id: expect.any(Number), name: "引越し", isArchived: false });

    await repo.update(created.id, { name: "01.引越し" });
    await repo.setArchived(created.id, true);

    expect(await repo.listAll()).toEqual([
      { id: created.id, name: "01.引越し", isArchived: true },
    ]);
  });

  it("アーカイブ済みも listAll に含まれる（復元できるようにするため）", async () => {
    const a = await repo.create({ name: "A" });
    await repo.create({ name: "B" });
    await repo.setArchived(a.id, true);
    expect(await repo.listAll()).toHaveLength(2);
  });
});
