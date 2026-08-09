import { eq } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { MODE_COLOR_BY_NAME } from "@/domain/mode/mode";
import { modes, projects, routineSkips, routines, sections, tasks } from "@/infrastructure/db/schema";
import { createTestDb, truncateAll } from "@/infrastructure/db/testing/test-db";
import { createTaskRepository } from "./drizzle-task-repository";

const { db, pool } = createTestDb();
const repo = createTaskRepository(db);

beforeEach(async () => {
  await truncateAll(db);
});

afterAll(async () => {
  await pool.end();
});

/** ルーチン由来タスクの展開元。ルーチンが絡む describe（先送り・削除とスキップ）が共有する */
async function createRoutine() {
  const [row] = await db
    .insert(routines)
    .values({
      name: "朝食",
      estimateMinutes: 20,
      scheduledStartTime: "06:30",
      recurrenceType: "daily",
      startDate: "2026-07-19",
    })
    .returning();
  return row;
}

describe("DrizzleTaskRepository.listByDate（画面定義書01 §7: 表示日1日分のみ取得）", () => {
  it("指定した task_date のタスクだけを返す", async () => {
    await db.insert(tasks).values([
      { taskDate: "2026-07-19", name: "当日", sortOrder: 1000 },
      { taskDate: "2026-07-20", name: "翌日", sortOrder: 1000 },
    ]);

    const found = await repo.listByDate("2026-07-19");
    expect(found.map((t) => t.name)).toEqual(["当日"]);
  });

  it("打刻・属性をドメイン表現へ写す", async () => {
    const [section] = await db
      .insert(sections)
      .values({ name: "朝", startTime: "06:00" })
      .returning();
    const startedAt = new Date("2026-07-19T06:30:00Z");
    const endedAt = new Date("2026-07-19T06:48:00Z");

    await db.insert(tasks).values({
      taskDate: "2026-07-19",
      name: "朝食",
      estimateMinutes: 20,
      sectionId: section.id,
      sortOrder: 2000,
      startedAt,
      endedAt,
      // コメント（F-206）は改行を含みうるので、写像で潰れないことも一緒に見る
      comment: "・パンが切れていた\n・買い足す",
      highlighted: true, // F-118
      postponedCount: 1,
    });

    expect(await repo.listByDate("2026-07-19")).toEqual([
      {
        id: expect.any(Number),
        taskDate: "2026-07-19",
        name: "朝食",
        estimateMinutes: 20,
        sectionId: section.id,
        modeId: null,
        projectId: null,
        sortOrder: 2000,
        startedAt,
        endedAt,
        comment: "・パンが切れていた\n・買い足す",
        highlighted: true,
        routineId: null,
        splitParentId: null,
        postponedCount: 1,
      },
    ]);
  });

  it("タスクがない日は空配列を返す", async () => {
    expect(await repo.listByDate("2026-07-19")).toEqual([]);
  });
});

describe("start（F-201: 付帯更新なしの開始打刻）", () => {
  it("割り込みも移動もなければ started_at だけを書き、配置は動かさない", async () => {
    const [morning] = await db
      .insert(sections)
      .values([{ name: "朝", startTime: "06:00" }])
      .returning();
    const [target] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "開始対象", sortOrder: 1000, sectionId: morning.id },
      ])
      .returning();
    const startedAt = new Date("2026-07-19T06:30:00Z");

    await repo.start({ taskId: target.id, startedAt, interruption: null, relocations: [] });

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.startedAt).toEqual(startedAt);
    expect(after.endedAt).toBeNull();
    expect([after.sectionId, after.sortOrder]).toEqual([morning.id, 1000]);
  });
});

describe("finish（F-201 / O-3: 終了打刻）", () => {
  it("対象の ended_at だけを書き、開始打刻・配置と隣の行は動かさない", async () => {
    const [morning] = await db
      .insert(sections)
      .values([{ name: "朝", startTime: "06:00" }])
      .returning();
    const startedAt = new Date("2026-07-19T06:30:00Z");
    // 未実行の行を並べるのは WHERE の効きを差として観測するため（1件だけだと全行更新でも通る）
    const [target, untouched] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "終了対象", sortOrder: 1000, sectionId: morning.id, startedAt },
        { taskDate: "2026-07-19", name: "未実行の行", sortOrder: 2000, sectionId: morning.id },
      ])
      .returning();
    const endedAt = new Date("2026-07-19T06:48:00Z");

    await repo.finish(target.id, endedAt);

    const after = await repo.listByDate("2026-07-19");
    const finished = after.find((t) => t.id === target.id);
    expect(finished?.startedAt).toEqual(startedAt);
    expect(finished?.endedAt).toEqual(endedAt);
    expect([finished?.sectionId, finished?.sortOrder]).toEqual([morning.id, 1000]);
    expect(after.find((t) => t.id === untouched.id)).toEqual(
      expect.objectContaining({ startedAt: null, endedAt: null })
    );
  });
});

describe("start の割り込み（F-201: 終了・再開タスク生成・開始を1トランザクションで）", () => {
  it("3つの更新がすべて反映される", async () => {
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const endedAt = new Date("2026-07-19T09:00:00Z");
    const [running, target] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "メールチェック", estimateMinutes: 30, sortOrder: 1000, startedAt },
        { taskDate: "2026-07-19", name: "設計書レビュー", estimateMinutes: 60, sortOrder: 2000 },
      ])
      .returning();

    await repo.start({
      taskId: target.id,
      startedAt: endedAt,
      interruption: {
        runningTaskId: running.id,
        endedAt,
        resumeTask: {
          taskDate: "2026-07-19",
          name: "メールチェック（再開）",
          estimateMinutes: 18,
          sectionId: null,
          modeId: null,
          projectId: null,
          sortOrder: 3000,
          // 再開タスクはハイライト（F-118）を引き継ぐ。INSERT は NewTask をそのまま流すので、
          // 列まで届くことを実DBで押さえる
          highlighted: true,
          splitParentId: running.id,
        },
        renumber: [],
      },
      relocations: [],
    });

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === running.id)?.endedAt).toEqual(endedAt);
    expect(after.find((t) => t.id === target.id)?.startedAt).toEqual(endedAt);
    expect(after.find((t) => t.splitParentId === running.id)).toEqual(
      expect.objectContaining({
        name: "メールチェック（再開）",
        estimateMinutes: 18,
        startedAt: null,
        highlighted: true,
      })
    );
  });

  it("再開タスクの生成に失敗したら全体が巻き戻る（トランザクション境界の確認）", async () => {
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const [running, target] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "実行中", sortOrder: 1000, startedAt },
        { taskDate: "2026-07-19", name: "開始対象", sortOrder: 2000 },
      ])
      .returning();

    await expect(
      repo.start({
        taskId: target.id,
        startedAt: new Date("2026-07-19T09:00:00Z"),
        interruption: {
          runningTaskId: running.id,
          endedAt: new Date("2026-07-19T09:00:00Z"),
          resumeTask: {
            taskDate: "2026-07-19",
            name: "再開",
            estimateMinutes: 10,
            sectionId: 999999, // 存在しないセクション → FK違反
            modeId: null,
            projectId: null,
            sortOrder: 3000,
            splitParentId: running.id,
          },
          renumber: [],
        },
        relocations: [],
      })
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === running.id)?.endedAt).toBeNull();
    expect(after.find((t) => t.id === target.id)?.startedAt).toBeNull();
    expect(after).toHaveLength(2);
  });

  // 割り込み（§4.2）に振り直し（§3.5）と自動セクション移動（§4.2-a）が同時に伴う経路。
  // 付帯更新が両方とも非空になるのはここだけなので、5つの更新の合流をここで固定する
  it("振り直しと移動を伴う割り込みで、5つの更新がすべて反映される", async () => {
    const [night] = await db
      .insert(sections)
      .values([{ name: "夜", startTime: "18:00" }])
      .returning();
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const endedAt = new Date("2026-07-19T09:00:00Z");
    const [running, target, neighbor] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "実行中", estimateMinutes: 30, sortOrder: 1000, startedAt },
        { taskDate: "2026-07-19", name: "開始対象", sortOrder: 2000 },
        { taskDate: "2026-07-19", name: "詰まっている隣", sortOrder: 2001 },
      ])
      .returning();

    await repo.start({
      taskId: target.id,
      startedAt: endedAt,
      interruption: {
        runningTaskId: running.id,
        endedAt,
        resumeTask: {
          taskDate: "2026-07-19",
          name: "実行中（再開）",
          estimateMinutes: 18,
          sectionId: night.id,
          modeId: null,
          projectId: null,
          sortOrder: 4000,
          splitParentId: running.id,
        },
        renumber: [{ taskId: neighbor.id, sortOrder: 5000 }],
      },
      relocations: [{ taskId: target.id, sectionId: night.id, sortOrder: 3000 }],
    });

    const after = await repo.listByDate("2026-07-19");
    const started = after.find((t) => t.id === target.id);
    expect(after.find((t) => t.id === running.id)?.endedAt).toEqual(endedAt); // ①実行中を終了
    expect(after.find((t) => t.splitParentId === running.id)).toEqual(
      expect.objectContaining({ estimateMinutes: 18, sortOrder: 4000, startedAt: null })
    ); // ②再開タスクを生成
    expect(started?.startedAt).toEqual(endedAt); // ③対象を開始
    expect([started?.sectionId, started?.sortOrder]).toEqual([night.id, 3000]); // ④対象を移動
    expect(after.find((t) => t.id === neighbor.id)?.sortOrder).toBe(5000); // ⑤隣を振り直し
  });

  // 移動と振り直しが同じ行を指す経路。ユースケース側は移動後の並びから振り直しを作る
  // （punch-usecases の startTask）ので、当てる順が逆だと移動が振り直しを上書きする
  it("移動と振り直しが同じ行を指したら、後から当てる振り直しの値が残る", async () => {
    const [night] = await db
      .insert(sections)
      .values([{ name: "夜", startTime: "18:00" }])
      .returning();
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const endedAt = new Date("2026-07-19T09:00:00Z");
    const [running, target] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "実行中", estimateMinutes: 30, sortOrder: 1000, startedAt },
        { taskDate: "2026-07-19", name: "開始対象", sortOrder: 2000 },
      ])
      .returning();

    await repo.start({
      taskId: target.id,
      startedAt: endedAt,
      interruption: {
        runningTaskId: running.id,
        endedAt,
        resumeTask: {
          taskDate: "2026-07-19",
          name: "実行中（再開）",
          estimateMinutes: 18,
          sectionId: night.id,
          modeId: null,
          projectId: null,
          sortOrder: 3000,
          splitParentId: running.id,
        },
        // 移動先で中間値が尽きて振り直した結果。対象自身を含む（placeSortOrder が moving を含めるため）
        renumber: [{ taskId: target.id, sortOrder: 2000 }],
      },
      relocations: [{ taskId: target.id, sectionId: night.id, sortOrder: 1001 }],
    });

    const after = await repo.listByDate("2026-07-19");
    const started = after.find((t) => t.id === target.id);
    // セクションは移動の値、sort_order は振り直しの値（1001 ではない）
    expect([started?.sectionId, started?.sortOrder]).toEqual([night.id, 2000]);
  });

  it("再開タスクの生成に失敗したら振り直しと移動も巻き戻る", async () => {
    const [night] = await db
      .insert(sections)
      .values([{ name: "夜", startTime: "18:00" }])
      .returning();
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const endedAt = new Date("2026-07-19T09:00:00Z");
    const [running, target, neighbor] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "実行中", sortOrder: 1000, startedAt },
        { taskDate: "2026-07-19", name: "開始対象", sortOrder: 2000 },
        { taskDate: "2026-07-19", name: "詰まっている隣", sortOrder: 2001 },
      ])
      .returning();

    await expect(
      repo.start({
        taskId: target.id,
        startedAt: endedAt,
        interruption: {
          runningTaskId: running.id,
          endedAt,
          resumeTask: {
            taskDate: "2026-07-19",
            name: "再開",
            estimateMinutes: 10,
            sectionId: 999999, // 存在しないセクション → FK違反
            modeId: null,
            projectId: null,
            sortOrder: 4000,
            splitParentId: running.id,
          },
          renumber: [{ taskId: neighbor.id, sortOrder: 5000 }],
        },
        relocations: [{ taskId: target.id, sectionId: night.id, sortOrder: 3000 }],
      })
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === neighbor.id)?.sortOrder).toBe(2001); // 振り直しが巻き戻っている
    expect(after.find((t) => t.id === target.id)?.sectionId).toBeNull(); // 移動も巻き戻っている
  });
});

describe("duplicateAndStart（F-208 / データモデル定義書 §4.6: 複製して開始）", () => {
  it("割り込みなしで、開始済みの複製タスクを生成する", async () => {
    const startedAt = new Date("2026-07-19T08:00:00Z");
    const endedAt = new Date("2026-07-19T08:30:00Z");
    const now = new Date("2026-07-19T09:00:00Z");
    const [source] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "ストレッチ", estimateMinutes: 15, sortOrder: 1000, startedAt, endedAt },
      ])
      .returning();

    const created = await repo.duplicateAndStart({
      newTask: {
        taskDate: "2026-07-19",
        name: source.name,
        estimateMinutes: 15,
        sectionId: null,
        modeId: null,
        projectId: null,
        sortOrder: 2000,
        splitParentId: null,
      },
      startedAt: now,
      interruption: null,
      renumber: [],
    });

    expect(created).toEqual(
      expect.objectContaining({ name: "ストレッチ", estimateMinutes: 15, startedAt: now, endedAt: null })
    );
    const after = await repo.listByDate("2026-07-19");
    expect(after).toHaveLength(2);
    // 複製元は完了のまま
    expect(after.find((t) => t.id === source.id)?.endedAt).toEqual(endedAt);
  });

  // 割り込みが無くても振り直しがあればトランザクションの枝を通る（`operations.ts` は
  // 移動先の中間値が尽きたときに実行中タスクの有無によらず振り直しを渡す）
  it("割り込みなしでも、振り直しは複製の生成と同じトランザクションで反映される", async () => {
    const now = new Date("2026-07-19T09:00:00Z");
    const [source, blocking] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "複製元", sortOrder: 1000, startedAt: now, endedAt: now },
        { taskDate: "2026-07-19", name: "詰まっている隣", sortOrder: 1001 },
      ])
      .returning();

    await repo.duplicateAndStart({
      newTask: {
        taskDate: "2026-07-19",
        name: source.name,
        estimateMinutes: 10,
        sectionId: null,
        modeId: null,
        projectId: null,
        sortOrder: 2000,
        splitParentId: null,
      },
      startedAt: now,
      interruption: null,
      renumber: [{ taskId: blocking.id, sortOrder: 3000 }],
    });

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === blocking.id)?.sortOrder).toBe(3000);
  });

  it("割り込みありで、終了・再開タスク生成・複製の開始が1トランザクションで反映される", async () => {
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const now = new Date("2026-07-19T09:00:00Z");
    const [source, running] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "もう一回やる", estimateMinutes: 20, sortOrder: 1000, startedAt, endedAt: now },
        { taskDate: "2026-07-19", name: "実行中", estimateMinutes: 30, sortOrder: 5000, startedAt },
      ])
      .returning();

    const created = await repo.duplicateAndStart({
      newTask: {
        taskDate: "2026-07-19",
        name: source.name,
        estimateMinutes: 20,
        sectionId: null,
        modeId: null,
        projectId: null,
        sortOrder: 6000,
        splitParentId: null,
      },
      startedAt: now,
      interruption: {
        runningTaskId: running.id,
        endedAt: now,
        resumeTask: {
          taskDate: "2026-07-19",
          name: "実行中（再開）",
          estimateMinutes: 18,
          sectionId: null,
          modeId: null,
          projectId: null,
          sortOrder: 7000,
          splitParentId: running.id,
        },
      },
      // 挿入位置に中間値が無かったときの振り直し（§3.5）。挿入より先に当たる
      renumber: [{ taskId: source.id, sortOrder: 3000 }],
    });

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === running.id)?.endedAt).toEqual(now); // 実行中を終了
    expect(after.find((t) => t.id === created.id)?.startedAt).toEqual(now); // 複製を開始
    expect(after.find((t) => t.splitParentId === running.id)).toEqual(
      expect.objectContaining({
        name: "実行中（再開）",
        estimateMinutes: 18,
        sortOrder: 7000,
        startedAt: null,
      })
    );
    expect(after.find((t) => t.id === source.id)?.sortOrder).toBe(3000); // 振り直しも同じトランザクション
  });

  it("再開タスクの生成に失敗したら全体が巻き戻る（トランザクション境界）", async () => {
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const now = new Date("2026-07-19T09:00:00Z");
    const [source, running] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "複製元", sortOrder: 1000, startedAt, endedAt: now },
        { taskDate: "2026-07-19", name: "実行中", sortOrder: 5000, startedAt },
      ])
      .returning();

    await expect(
      repo.duplicateAndStart({
        newTask: {
          taskDate: "2026-07-19",
          name: "複製",
          estimateMinutes: 10,
          sectionId: null,
          modeId: null,
          projectId: null,
          sortOrder: 6000,
          splitParentId: null,
        },
        startedAt: now,
        interruption: {
          runningTaskId: running.id,
          endedAt: now,
          resumeTask: {
            taskDate: "2026-07-19",
            name: "再開",
            estimateMinutes: 10,
            sectionId: 999999, // 存在しないセクション → FK違反
            modeId: null,
            projectId: null,
            sortOrder: 7000,
            splitParentId: running.id,
          },
        },
        renumber: [{ taskId: source.id, sortOrder: 3000 }],
      })
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === running.id)?.endedAt).toBeNull(); // 終了が巻き戻る
    expect(after.find((t) => t.id === source.id)?.sortOrder).toBe(1000); // 振り直しも巻き戻る
    expect(after).toHaveLength(2); // 複製も再開も作られない
  });
});

describe("findRunning（実行中は全日付を通じて最大1件）", () => {
  it("日付をまたいでも実行中タスクを見つける", async () => {
    await db.insert(tasks).values([
      { taskDate: "2026-07-18", name: "前日の実行中", sortOrder: 1000, startedAt: new Date("2026-07-18T23:00:00Z") },
      { taskDate: "2026-07-19", name: "未実行", sortOrder: 1000 },
    ]);

    expect((await repo.findRunning())?.name).toBe("前日の実行中");
  });

  it("実行中がなければ null", async () => {
    await db.insert(tasks).values({ taskDate: "2026-07-19", name: "未実行", sortOrder: 1000 });
    expect(await repo.findRunning()).toBeNull();
  });
});

describe("suspend（F-204: 終了と再開タスク生成を1トランザクションで）", () => {
  it("元タスクの終了と再開タスクの生成が両方反映される", async () => {
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const endedAt = new Date("2026-07-19T09:00:00Z");
    const [running] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "執筆", estimateMinutes: 30, sortOrder: 1000, startedAt })
      .returning();

    await repo.suspend({
      taskId: running.id,
      endedAt,
      resumeTask: {
        taskDate: "2026-07-19",
        name: "執筆（再開）",
        estimateMinutes: 18,
        sectionId: null,
        modeId: null,
        projectId: null,
        sortOrder: 2000,
        splitParentId: running.id,
      },
      renumber: [],
    });

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === running.id)?.endedAt).toEqual(endedAt);
    expect(after.find((t) => t.splitParentId === running.id)).toEqual(
      expect.objectContaining({ name: "執筆（再開）", estimateMinutes: 18, startedAt: null })
    );
  });

  // 中断は再開タスクを「直後」に挟むので、隙間が無ければ振り直しが要る（データモデル定義書 §3.5）。
  // 振り直しが落ちると、挟んだはずの再開タスクが次のタスクの後ろへ回る
  it("振り直しを伴う中断で、振り直しと終了・再開タスク生成がすべて反映される", async () => {
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const endedAt = new Date("2026-07-19T09:00:00Z");
    // 元タスクも動かす採番にするのは、振り直しの2件がどちらも効くことを見るため
    const [running, next] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "執筆", estimateMinutes: 30, sortOrder: 900, startedAt },
        { taskDate: "2026-07-19", name: "次のタスク", sortOrder: 901 }, // 直後に隙間が無い
      ])
      .returning();

    await repo.suspend({
      taskId: running.id,
      endedAt,
      resumeTask: {
        taskDate: "2026-07-19",
        name: "執筆（再開）",
        estimateMinutes: 18,
        sectionId: null,
        modeId: null,
        projectId: null,
        sortOrder: 2000,
        splitParentId: running.id,
      },
      renumber: [
        { taskId: running.id, sortOrder: 1000 },
        { taskId: next.id, sortOrder: 3000 },
      ],
    });

    const bySortOrder = (await repo.listByDate("2026-07-19")).sort(
      (a, b) => a.sortOrder - b.sortOrder
    );
    expect(bySortOrder.map((t) => [t.id, t.sortOrder])).toEqual([
      [running.id, 1000],
      [expect.any(Number), 2000], // 挟まれた再開タスク
      [next.id, 3000],
    ]);
    expect(bySortOrder[0].endedAt).toEqual(endedAt);
    expect(bySortOrder[1].splitParentId).toBe(running.id);
  });

  it("再開タスクの生成に失敗したら振り直しと終了も巻き戻る（トランザクション境界）", async () => {
    const startedAt = new Date("2026-07-19T08:48:00Z");
    const [running, next] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "執筆", estimateMinutes: 30, sortOrder: 900, startedAt },
        { taskDate: "2026-07-19", name: "次のタスク", sortOrder: 901 },
      ])
      .returning();

    await expect(
      repo.suspend({
        taskId: running.id,
        endedAt: new Date("2026-07-19T09:00:00Z"),
        resumeTask: {
          taskDate: "2026-07-19",
          name: "執筆（再開）",
          estimateMinutes: 18,
          sectionId: 999999, // 存在しないセクション → FK違反
          modeId: null,
          projectId: null,
          sortOrder: 2000,
          splitParentId: running.id,
        },
        renumber: [
          { taskId: running.id, sortOrder: 1000 },
          { taskId: next.id, sortOrder: 3000 },
        ],
      })
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after).toHaveLength(2); // 再開タスクは作られていない
    expect(after.find((t) => t.id === running.id)?.endedAt).toBeNull();
    expect(after.find((t) => t.id === next.id)?.sortOrder).toBe(901);
  });
});

describe("postpone（F-107: 先送り）", () => {
  // ルーチン由来でない先送り。日付・並び・回数の3つだけが動き、持ち物（見積もり・セクション・
  // コメント・ハイライト）は一緒に移る。ルーチン由来では routine_id も動く（次のテスト）
  it("task_date・sort_order・postponed_count だけを動かす", async () => {
    const [section] = await db
      .insert(sections)
      .values({ name: "朝", startTime: "06:00" })
      .returning();
    const [target] = await db
      .insert(tasks)
      .values({
        taskDate: "2026-07-19",
        name: "先送り対象",
        estimateMinutes: 25,
        sectionId: section.id,
        sortOrder: 1000,
        comment: "明日やる",
        highlighted: true,
        postponedCount: 1,
      })
      .returning();

    await repo.postpone(target.id, { taskDate: "2026-07-20", sortOrder: 3000 }, null);

    expect(await repo.listByDate("2026-07-19")).toHaveLength(0);
    expect(await repo.listByDate("2026-07-20")).toEqual([
      {
        id: target.id,
        taskDate: "2026-07-20", // 動く
        name: "先送り対象",
        estimateMinutes: 25,
        sectionId: section.id,
        modeId: null,
        projectId: null,
        sortOrder: 3000, // 動く
        startedAt: null,
        endedAt: null,
        comment: "明日やる",
        highlighted: true,
        routineId: null,
        splitParentId: null,
        postponedCount: 2, // 動く
      },
    ]);
  });

  // §3.5: 移動先の日にはその日のぶんが改めて展開されるので紐付けを切る。
  // §3.6: 元の日のスキップを記録しないと、その日を再表示した時点で §4.1 が展開し直す
  it("ルーチン由来なら紐付けを外し、同じトランザクションで元の日のスキップを記録する", async () => {
    const routine = await createRoutine();
    const [target] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, routineId: routine.id })
      .returning();

    await repo.postpone(
      target.id,
      { taskDate: "2026-07-20", sortOrder: 1000 },
      { routineId: routine.id, taskDate: "2026-07-19" }
    );

    expect((await repo.listByDate("2026-07-20"))[0].routineId).toBeNull();
    expect(await db.select().from(routineSkips)).toEqual([
      expect.objectContaining({ routineId: routine.id, taskDate: "2026-07-19" }),
    ]);
  });

  it("スキップの記録に失敗したら移動も巻き戻る", async () => {
    const routine = await createRoutine();
    const [target] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, routineId: routine.id })
      .returning();

    await expect(
      // 存在しないルーチン → FK違反（onConflictDoNothing が吸うのは unique 衝突だけ）
      repo.postpone(
        target.id,
        { taskDate: "2026-07-20", sortOrder: 1000 },
        { routineId: 999999, taskDate: "2026-07-19" }
      )
    ).rejects.toThrow();

    // 記録できないまま移すと、元の日を再表示した時点で同じタスクが再展開される
    expect(await repo.listByDate("2026-07-19")).toHaveLength(1);
    expect(await repo.listByDate("2026-07-20")).toHaveLength(0);
  });

  it("移動先に同じルーチンの展開済みタスクがあっても先送りできる", async () => {
    const routine = await createRoutine();
    const [target, expanded] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, routineId: routine.id },
        { taskDate: "2026-07-20", name: "朝食", sortOrder: 1000, routineId: routine.id },
      ])
      .returning();

    await repo.postpone(
      target.id,
      { taskDate: "2026-07-20", sortOrder: 2000 },
      { routineId: routine.id, taskDate: "2026-07-19" }
    );

    // 先送り分（紐付けなし）と、移動先の日のぶん（紐付けあり）が並ぶ
    const moved = await repo.listByDate("2026-07-20");
    expect(moved).toHaveLength(2);
    expect(moved).toContainEqual(
      expect.objectContaining({ id: expanded.id, routineId: routine.id, postponedCount: 0 })
    );
    expect(moved).toContainEqual(
      expect.objectContaining({ id: target.id, routineId: null, postponedCount: 1 })
    );
  });
});

// 付帯更新を持たない編集経路（rename / updateEstimate は単文 UPDATE のまま）
describe("rename / updateEstimate（O-5: タスク名・見積もりのインライン編集）", () => {
  it("対象行の値だけを書き換える（隣の行は動かさない）", async () => {
    const [target, other] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "資料作成", estimateMinutes: 30, sortOrder: 1000 },
        { taskDate: "2026-07-19", name: "隣の行", estimateMinutes: 15, sortOrder: 2000 },
      ])
      .returning();

    await repo.rename(target.id, "資料作成（改）");
    await repo.updateEstimate(target.id, 45);

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === target.id)).toEqual(
      expect.objectContaining({ name: "資料作成（改）", estimateMinutes: 45, sortOrder: 1000 })
    );
    expect(after.find((t) => t.id === other.id)).toEqual(
      expect.objectContaining({ name: "隣の行", estimateMinutes: 15 })
    );
  });
});

describe("updateClassification（F-401 / F-402 / O-5: モード・プロジェクトの割り当て）", () => {
  /**
   * 分類を持つ行を2つ作る。2行目（`other`）は WHERE の効きを差として観測するためのもので、
   * 更新後に見る値が1行目と食い違うよう別のプロジェクトを指しておく
   */
  async function twoClassifiedTasks() {
    const [work, life] = await db
      .insert(modes)
      .values([
        { name: "仕事", color: MODE_COLOR_BY_NAME["青"] },
        { name: "暮らし", color: MODE_COLOR_BY_NAME["緑"] },
      ])
      .returning();
    const [moving, study] = await db
      .insert(projects)
      .values([{ name: "引越し" }, { name: "資格勉強" }])
      .returning();
    const [target, other] = await db
      .insert(tasks)
      .values([
        {
          taskDate: "2026-07-19",
          name: "見積もり依頼",
          sortOrder: 1000,
          modeId: work.id,
          projectId: moving.id,
        },
        {
          taskDate: "2026-07-19",
          name: "隣の行",
          sortOrder: 2000,
          modeId: work.id,
          projectId: study.id,
        },
      ])
      .returning();
    return { work, life, moving, study, target, other };
  }

  // 片方だけを渡す形（`modeId?` / `projectId?`）は M キーと P キーが別操作であることの写し。
  // 省略した側を null で潰すと、モードを変えただけでプロジェクトが外れる
  it("渡した列だけを更新する（省略した側と隣の行は元の値のまま）", async () => {
    const { work, life, moving, study, target, other } = await twoClassifiedTasks();

    await repo.updateClassification(target.id, { modeId: life.id });

    expect(await repo.findById(target.id)).toEqual(
      expect.objectContaining({ modeId: life.id, projectId: moving.id })
    );
    expect(await repo.findById(other.id)).toEqual(
      expect.objectContaining({ modeId: work.id, projectId: study.id })
    );
  });

  it("null を渡せば外せる（未設定へ戻す）", async () => {
    const { work, study, target, other } = await twoClassifiedTasks();

    await repo.updateClassification(target.id, { projectId: null });

    expect(await repo.findById(target.id)).toEqual(
      expect.objectContaining({ modeId: work.id, projectId: null })
    );
    expect(await repo.findById(other.id)).toEqual(
      expect.objectContaining({ projectId: study.id })
    );
  });
});

// ドメイン表現への写像そのものは listByDate のテストが全列で固定しているので、
// ここで見るのは findById 固有の2点——指定した行を選ぶことと、無ければ null を返すこと
describe("findById（00_共通 §4.1: 存在検査が拠り所にする1件取得）", () => {
  /** 2行入れるのは「どれか1件を返して緑」を許さないため */
  async function twoRowsForLookup() {
    return await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "1件目", sortOrder: 1000 },
        { taskDate: "2026-07-19", name: "2件目", sortOrder: 2000 },
      ])
      .returning();
  }

  it("指定した id の行を返す", async () => {
    const [first, second] = await twoRowsForLookup();

    expect(await repo.findById(second.id)).toEqual(
      expect.objectContaining({ id: second.id, name: "2件目" })
    );
    expect(await repo.findById(first.id)).toEqual(
      expect.objectContaining({ id: first.id, name: "1件目" })
    );
  });

  // ユースケースの存在検査（00_共通 §4.1）は、この null をもって「対象が無い」と判定する
  it("存在しない id は例外でなく null を返す", async () => {
    const rows = await twoRowsForLookup();

    expect(await repo.findById(Math.max(...rows.map((r) => r.id)) + 1)).toBeNull();
  });
});

describe("updateComment（F-206 / O-16: コメントの保存と消去）", () => {
  // 長さ無制限（F-206）を実際に制限しうるのは列型（`text`）なので、純関数だけでなく実DBで往復させる。
  // NULL への書き戻しも同じ経路で確かめる（`comment` は消せることが仕様の一部）
  it("長文・改行を保ったまま往復し、null で消せる", async () => {
    const comment = `${"あ".repeat(5000)}\n2行目`;
    const [target] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "資料作成", sortOrder: 1000 })
      .returning();

    await repo.updateComment(target.id, comment);
    expect((await repo.findById(target.id))?.comment).toBe(comment);

    await repo.updateComment(target.id, null);
    expect((await repo.findById(target.id))?.comment).toBeNull();
  });
});

describe("updateHighlight（F-118 / O-17: ハイライトの付け外し）", () => {
  // 既定値（DEFAULT false）と往復を実DBで見る。既定値はルーチン展開が常に OFF になる根拠でもある
  it("既定は false で、付けて外せる", async () => {
    const [target] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "提案書", sortOrder: 1000 })
      .returning();
    expect((await repo.findById(target.id))?.highlighted).toBe(false);

    await repo.updateHighlight(target.id, true);
    expect((await repo.findById(target.id))?.highlighted).toBe(true);

    await repo.updateHighlight(target.id, false);
    expect((await repo.findById(target.id))?.highlighted).toBe(false);
  });
});

// 偽物（`usecases/task/testing/in-memory-repository.ts`）が写している本物側の契約。
// ユースケースの存在検査（00_共通 §4.1）は「1行も当たらない更新は失敗」を返す側の話で、
// リポジトリはそこへ届く前に例外を出したり別の行を壊したりしない、を本物で確かめる
describe("存在しない id への更新・削除（0行で静かに終わる）", () => {
  /** 2行入れるのは、巻き添え（末尾行の削除・隣の行への書き込み）を差として観測するため */
  async function twoRows() {
    return await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "先頭", sortOrder: 1000, estimateMinutes: 15 },
        { taskDate: "2026-07-19", name: "末尾", sortOrder: 2000, comment: "元のまま" },
      ])
      .returning();
  }

  it("削除は1行も消さない", async () => {
    const rows = await twoRows();
    const before = await repo.listByDate("2026-07-19");

    await repo.delete(Math.max(...rows.map((r) => r.id)) + 1, null);

    expect(await repo.listByDate("2026-07-19")).toEqual(before);
  });

  it("更新は例外にならず、残っている行も変わらない", async () => {
    const rows = await twoRows();
    const missing = Math.max(...rows.map((r) => r.id)) + 1;
    const before = await repo.listByDate("2026-07-19");

    await repo.rename(missing, "新名");
    await repo.updateEstimate(missing, 45);
    await repo.updateComment(missing, "書き換え");
    await repo.updateClassification(missing, { modeId: null });

    expect(await repo.listByDate("2026-07-19")).toEqual(before);
  });
});

describe("delete / restore（O-8: 削除と取り消し）", () => {
  // restore は Task の全列を書き戻す唯一の経路なので、既定値では埋まらない値を全列に置いて往復させる
  // （一部の列を落としても既定値と区別が付かないため）。id だけは採番し直される
  it("削除したタスクを全列そのままで復元し、復元行をドメイン表現で返す", async () => {
    const startedAt = new Date("2026-07-19T08:00:00Z");
    const endedAt = new Date("2026-07-19T08:30:00Z");
    const [section] = await db
      .insert(sections)
      .values({ name: "朝", startTime: "06:00" })
      .returning();
    const [mode] = await db
      .insert(modes)
      .values({ name: "集中", color: MODE_COLOR_BY_NAME["青"] })
      .returning();
    const [project] = await db.insert(projects).values({ name: "資料整備" }).returning();
    const [parent] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "分割元", sortOrder: 500 })
      .returning();
    const [target] = await db
      .insert(tasks)
      .values({
        taskDate: "2026-07-19",
        name: "消すタスク",
        estimateMinutes: 25,
        sectionId: section.id,
        modeId: mode.id,
        projectId: project.id,
        sortOrder: 1000,
        startedAt,
        endedAt,
        comment: "続きは明日",
        highlighted: true,
        splitParentId: parent.id,
        postponedCount: 2,
      })
      .returning();

    await repo.delete(target.id, null);
    expect(await repo.listByDate("2026-07-19")).toHaveLength(1); // 分割元だけが残る

    const { id, ...rest } = target;
    const restored = await repo.restore(rest, null);

    // ルーチン由来（routine_id）の復元はスキップ解除を伴うので下の describe が持つ
    expect(restored).toEqual({
      id: expect.any(Number),
      taskDate: "2026-07-19",
      name: "消すタスク",
      estimateMinutes: 25,
      sectionId: section.id,
      modeId: mode.id,
      projectId: project.id,
      sortOrder: 1000,
      startedAt,
      endedAt,
      comment: "続きは明日",
      highlighted: true,
      routineId: null,
      splitParentId: parent.id,
      postponedCount: 2,
    });
    expect(restored.id).not.toBe(id); // 復元は新しい行なので採番し直される
    expect(await repo.listByDate("2026-07-19")).toContainEqual(restored);
  });
});

describe("ルーチン由来タスクの削除とスキップ（F-301 / データモデル定義書 §3.6）", () => {
  it("削除すると同じトランザクションでスキップが記録される", async () => {
    const routine = await createRoutine();
    const [target] = await db
      .insert(tasks)
      .values({
        taskDate: "2026-07-19",
        name: "朝食",
        sortOrder: 1000,
        routineId: routine.id,
      })
      .returning();

    await repo.delete(target.id, { routineId: routine.id, taskDate: "2026-07-19" });

    expect(await repo.listByDate("2026-07-19")).toHaveLength(0);
    expect(await db.select().from(routineSkips)).toEqual([
      expect.objectContaining({ routineId: routine.id, taskDate: "2026-07-19" }),
    ]);
  });

  it("スキップの記録に失敗したらタスクの削除も巻き戻る", async () => {
    const routine = await createRoutine();
    const [target] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, routineId: routine.id })
      .returning();

    await expect(
      // 存在しないルーチン → FK違反（onConflictDoNothing が吸うのは unique 衝突だけ）
      repo.delete(target.id, { routineId: 999999, taskDate: "2026-07-19" })
    ).rejects.toThrow();

    // 記録できないままタスクだけ消えると、次の表示で同じタスクが再展開される
    expect(await repo.listByDate("2026-07-19")).toHaveLength(1);
    expect(await db.select().from(routineSkips)).toHaveLength(0);
  });

  it("復元するとスキップが解除される（再展開できる状態に戻る）", async () => {
    const routine = await createRoutine();
    const [target] = await db
      .insert(tasks)
      .values({
        taskDate: "2026-07-19",
        name: "朝食",
        sortOrder: 1000,
        routineId: routine.id,
      })
      .returning();
    const skip = { routineId: routine.id, taskDate: "2026-07-19" };

    await repo.delete(target.id, skip);
    const { id, ...rest } = { ...target, taskDate: "2026-07-19" };
    void id;
    await repo.restore(rest, skip);

    expect(await repo.listByDate("2026-07-19")).toHaveLength(1);
    expect(await db.select().from(routineSkips)).toHaveLength(0);
  });

  it("復元に失敗したらスキップの解除も巻き戻る", async () => {
    const routine = await createRoutine();
    const [target] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, routineId: routine.id })
      .returning();
    const skip = { routineId: routine.id, taskDate: "2026-07-19" };

    await repo.delete(target.id, skip);
    const { id, ...rest } = { ...target, taskDate: "2026-07-19" };
    void id;

    await expect(
      repo.restore({ ...rest, sectionId: 999999 }, skip) // 存在しないセクション → FK違反
    ).rejects.toThrow();

    // 解除だけ残ると、復元できていないルーチンが次の表示で重複展開される
    expect(await db.select().from(routineSkips)).toHaveLength(1);
    expect(await repo.listByDate("2026-07-19")).toHaveLength(0);
  });

  it("同じ日に複数回スキップを記録しても1件（記録も冪等）", async () => {
    const routine = await createRoutine();
    const skip = { routineId: routine.id, taskDate: "2026-07-19" };

    // 削除 → 再展開 → また削除、という流れでも記録は増えない
    for (let attempt = 0; attempt < 2; attempt++) {
      const [task] = await db
        .insert(tasks)
        .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, routineId: routine.id })
        .returning();
      await repo.delete(task.id, skip);
    }

    expect(await db.select().from(routineSkips)).toHaveLength(1);
  });

  it("ルーチンを削除するとスキップも消える（ON DELETE CASCADE）", async () => {
    const routine = await createRoutine();
    const [target] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "朝食", sortOrder: 1000, routineId: routine.id })
      .returning();

    await repo.delete(target.id, { routineId: routine.id, taskDate: "2026-07-19" });
    await db.delete(routines).where(eq(routines.id, routine.id));

    expect(await db.select().from(routineSkips)).toHaveLength(0);
  });
});

describe("create の振り直し（データモデル定義書 §3.5: 中間値が尽きたとき）", () => {
  it("振り直しが無いときは既定値のまま挿入し、挿入行をドメイン表現で返す", async () => {
    const created = await repo.create(
      {
        taskDate: "2026-07-19",
        name: "クイック追加",
        estimateMinutes: 0,
        sectionId: null,
        modeId: null,
        projectId: null,
        sortOrder: 1000,
      },
      []
    );

    expect(created).toEqual({
      id: expect.any(Number),
      taskDate: "2026-07-19",
      name: "クイック追加",
      estimateMinutes: 0,
      sectionId: null,
      modeId: null,
      projectId: null,
      sortOrder: 1000,
      startedAt: null,
      endedAt: null,
      comment: null,
      highlighted: false,
      routineId: null,
      splitParentId: null,
      postponedCount: 0,
    });
    expect(await repo.listByDate("2026-07-19")).toEqual([created]);
  });

  it("振り直しと挿入が同じトランザクションで反映される", async () => {
    const [first, second] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "A", sortOrder: 1000 },
        { taskDate: "2026-07-19", name: "B", sortOrder: 1001 },
      ])
      .returning();

    await repo.create(
      {
        taskDate: "2026-07-19",
        name: "割り込み",
        estimateMinutes: 0,
        sectionId: null,
        modeId: null,
        projectId: null,
        sortOrder: 2000,
      },
      [
        { taskId: first.id, sortOrder: 1000 },
        { taskId: second.id, sortOrder: 3000 },
      ]
    );

    const after = (await repo.listByDate("2026-07-19")).sort((a, b) => a.sortOrder - b.sortOrder);
    expect(after.map((t) => [t.name, t.sortOrder])).toEqual([
      ["A", 1000],
      ["割り込み", 2000],
      ["B", 3000],
    ]);
  });

  it("挿入に失敗したら振り直しも巻き戻る", async () => {
    const [first] = await db
      .insert(tasks)
      .values({ taskDate: "2026-07-19", name: "A", sortOrder: 1000 })
      .returning();

    await expect(
      repo.create(
        {
          taskDate: "2026-07-19",
          name: "不正",
          estimateMinutes: 0,
          sectionId: 999999, // 存在しないセクション → FK違反
          modeId: null,
          projectId: null,
          sortOrder: 2000,
        },
        [{ taskId: first.id, sortOrder: 5000 }]
      )
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after).toHaveLength(1);
    expect(after[0].sortOrder).toBe(1000); // 振り直しが巻き戻っている
  });
});

describe("move（画面定義書01 O-6 / データモデル定義書 §3.5: 並び替え）", () => {
  // 振り直しを伴う移動（下2件）はいずれも未分類の中の移動なので、section_id の変更はここだけが見ている
  it("振り直しが無ければ別セクションへ移し替える（section_id と sort_order）", async () => {
    const [morning, forenoon] = await db
      .insert(sections)
      .values([
        { name: "朝", startTime: "06:00" },
        { name: "午前", startTime: "09:00" },
      ])
      .returning();
    const [target] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "移動対象", sortOrder: 1000, sectionId: morning.id },
      ])
      .returning();

    await repo.move({ taskId: target.id, sectionId: forenoon.id, sortOrder: 1500, renumber: [] });

    const [after] = await repo.listByDate("2026-07-19");
    expect([after.sectionId, after.sortOrder]).toEqual([forenoon.id, 1500]);
  });

  it("振り直しを伴う移動は振り直しと本体更新が同じトランザクションで反映される", async () => {
    await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "A", sortOrder: 1000 },
        { taskDate: "2026-07-19", name: "B", sortOrder: 1001 },
        { taskDate: "2026-07-19", name: "移動対象", sortOrder: 5000 },
      ])
      .returning();
    const byName = Object.fromEntries(
      (await repo.listByDate("2026-07-19")).map((t) => [t.name, t.id])
    );

    // A と B の間へ移動する（中間値が尽きているのでグループ全体を1000刻みへ振り直す）
    await repo.move({
      taskId: byName["移動対象"],
      sectionId: null,
      sortOrder: 2000,
      renumber: [
        { taskId: byName["A"], sortOrder: 1000 },
        { taskId: byName["B"], sortOrder: 3000 },
      ],
    });

    const after = (await repo.listByDate("2026-07-19")).sort((x, y) => x.sortOrder - y.sortOrder);
    expect(after.map((t) => [t.name, t.sortOrder])).toEqual([
      ["A", 1000],
      ["移動対象", 2000],
      ["B", 3000],
    ]);
  });

  // reorderTask は `placeSortOrder(others, index, target)` と移動対象自身を渡すので、
  // 中間値が尽きたときの振り直しには**必ず移動対象が含まれる**（domain/task/reorder.ts）。
  // セクションをまたぐ形にしているのは、`applyRenumber` が sort_order しか書かないため
  // **section_id を書けるのは本体の更新だけ**になり、本体の更新も同時に固定できるから
  it("振り直しが移動対象自身を含む、セクションをまたぐ移動", async () => {
    const [morning, forenoon] = await db
      .insert(sections)
      .values([
        { name: "朝", startTime: "06:00" },
        { name: "午前", startTime: "09:00" },
      ])
      .returning();
    await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "A", sortOrder: 1000, sectionId: forenoon.id },
        { taskDate: "2026-07-19", name: "B", sortOrder: 1001, sectionId: forenoon.id },
        { taskDate: "2026-07-19", name: "移動対象", sortOrder: 1000, sectionId: morning.id },
      ]);
    const byName = Object.fromEntries(
      (await repo.listByDate("2026-07-19")).map((t) => [t.name, t.id])
    );

    // 朝の対象を、午前の A と B の間へ。移動先の中間値が尽きているのでグループ全体を振り直す
    await repo.move({
      taskId: byName["移動対象"],
      sectionId: forenoon.id,
      sortOrder: 2000,
      renumber: [
        { taskId: byName["A"], sortOrder: 1000 },
        { taskId: byName["移動対象"], sortOrder: 2000 },
        { taskId: byName["B"], sortOrder: 3000 },
      ],
    });

    const after = (await repo.listByDate("2026-07-19")).sort((x, y) => x.sortOrder - y.sortOrder);
    expect(after.map((t) => [t.name, t.sectionId, t.sortOrder])).toEqual([
      ["A", forenoon.id, 1000],
      ["移動対象", forenoon.id, 2000],
      ["B", forenoon.id, 3000],
    ]);
  });

  it("移動に失敗したら振り直しも巻き戻る", async () => {
    const [a, target] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "A", sortOrder: 1000 },
        { taskDate: "2026-07-19", name: "移動対象", sortOrder: 2000 },
      ])
      .returning();

    await expect(
      repo.move({
        taskId: target.id,
        sectionId: 999999, // 存在しないセクション → FK違反
        sortOrder: 3000,
        renumber: [{ taskId: a.id, sortOrder: 5000 }],
      })
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after.find((t) => t.id === a.id)?.sortOrder).toBe(1000); // 振り直しが巻き戻っている
  });
});

describe("relocate（F-113 / データモデル定義書 §4.4: 自動セクション移動）", () => {
  it("複数行の section_id と sort_order がまとめて反映される", async () => {
    const [morning, forenoon] = await db
      .insert(sections)
      .values([
        { name: "朝", startTime: "06:00" },
        { name: "午前", startTime: "09:00" },
      ])
      .returning();
    const [a, b] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "A", sortOrder: 1000, sectionId: morning.id },
        { taskDate: "2026-07-19", name: "B", sortOrder: 2000, sectionId: morning.id },
      ])
      .returning();

    await repo.relocate([
      { taskId: a.id, sectionId: forenoon.id, sortOrder: 500 },
      { taskId: b.id, sectionId: forenoon.id, sortOrder: 600 },
    ]);

    const after = await repo.listByDate("2026-07-19");
    expect(after.map((t) => [t.id, t.sectionId, t.sortOrder])).toEqual(
      expect.arrayContaining([
        [a.id, forenoon.id, 500],
        [b.id, forenoon.id, 600],
      ])
    );
  });

  // 移動先が現在地と同じなら relocations は空で届く（F-113 の規則が「動かす必要なし」と出す形）。
  // 守るのは早期 return という書き方ではなく「空でも安全に呼べる」契約——外して空の
  // トランザクションを開いても結果は同じなので、このテストで分岐の有無は判定できない
  it("空配列では何も変えない（呼び出し側が空チェックを持たなくてよい）", async () => {
    const [morning] = await db
      .insert(sections)
      .values([{ name: "朝", startTime: "06:00" }])
      .returning();
    await db
      .insert(tasks)
      .values([{ taskDate: "2026-07-19", name: "A", sortOrder: 1000, sectionId: morning.id }]);
    const before = await repo.listByDate("2026-07-19");

    await repo.relocate([]);

    expect(await repo.listByDate("2026-07-19")).toEqual(before);
  });

  it("途中で失敗した場合は1件も反映されない（1トランザクション）", async () => {
    const [morning] = await db
      .insert(sections)
      .values([{ name: "朝", startTime: "06:00" }])
      .returning();
    const [a] = await db
      .insert(tasks)
      .values([{ taskDate: "2026-07-19", name: "A", sortOrder: 1000, sectionId: morning.id }])
      .returning();

    await expect(
      repo.relocate([
        { taskId: a.id, sectionId: morning.id, sortOrder: 500 },
        { taskId: a.id, sectionId: 999999, sortOrder: 600 }, // 存在しないセクション → FK違反
      ])
    ).rejects.toThrow();

    const after = await repo.listByDate("2026-07-19");
    expect(after[0].sortOrder).toBe(1000); // 1件目の更新も巻き戻っている
  });

  it("start（§4.2-a）: 打刻と移動が同じトランザクションで反映される", async () => {
    const [night] = await db
      .insert(sections)
      .values([{ name: "夜", startTime: "18:00" }])
      .returning();
    const [target] = await db
      .insert(tasks)
      .values([{ taskDate: "2026-07-19", name: "未分類のタスク", sortOrder: 1000 }])
      .returning();
    const startedAt = new Date("2026-07-19T09:00:00Z");

    await repo.start({
      taskId: target.id,
      startedAt,
      interruption: null,
      relocations: [{ taskId: target.id, sectionId: night.id, sortOrder: 1000 }],
    });

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.startedAt).toEqual(startedAt);
    expect(after.sectionId).toBe(night.id);
  });
});

describe("undoStart（F-210 / データモデル定義書 §4.5: 開始打刻の取り消し）", () => {
  it("started_at を null に戻し、並べ直しを同じトランザクションで反映する", async () => {
    const [morning, night] = await db
      .insert(sections)
      .values([
        { name: "朝", startTime: "06:00" },
        { name: "夜", startTime: "18:00" },
      ])
      .returning();
    const [target] = await db
      .insert(tasks)
      .values([
        {
          taskDate: "2026-07-19",
          name: "実行中タスク",
          sortOrder: 1000,
          sectionId: morning.id,
          startedAt: new Date("2026-07-19T09:00:00Z"),
        },
      ])
      .returning();

    await repo.undoStart(target.id, [{ taskId: target.id, sectionId: night.id, sortOrder: 500 }]);

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.startedAt).toBeNull();
    expect(after.sectionId).toBe(night.id);
    expect(after.sortOrder).toBe(500);
  });

  // 並べ直しが空＝単文で書く枝。「今日以外は並べ直さない」という規則そのものはユースケース側の
  // 責務（punch-usecases の relocationsForUndoPunch）で、リポジトリは today を知らない
  it("並べ直しが空でも started_at をクリアできる", async () => {
    const [morning] = await db
      .insert(sections)
      .values([{ name: "朝", startTime: "06:00" }])
      .returning();
    const [target] = await db
      .insert(tasks)
      .values([
        {
          taskDate: "2026-07-18",
          name: "前日の実行中タスク",
          sortOrder: 1000,
          sectionId: morning.id,
          startedAt: new Date("2026-07-18T09:00:00Z"),
        },
      ])
      .returning();

    await repo.undoStart(target.id, []);

    const [after] = await repo.listByDate("2026-07-18");
    expect(after.startedAt).toBeNull();
    expect(after.sectionId).toBe(morning.id); // 並べ直さない
  });
});

describe("undoComplete（F-212 / データモデル定義書 §4.7: 完了の取り消し）", () => {
  const startedAt = new Date("2026-07-19T09:00:00Z");
  const endedAt = new Date("2026-07-19T09:30:00Z");

  async function insertCompleted(taskDate: string, sectionId: number) {
    const [target] = await db
      .insert(tasks)
      .values([
        { taskDate, name: "完了タスク", sortOrder: 1000, sectionId, startedAt, endedAt },
      ])
      .returning();
    return target;
  }

  it("started_at・ended_at をともに null に戻し、並べ直しを同じトランザクションで反映する", async () => {
    const [morning, night] = await db
      .insert(sections)
      .values([
        { name: "朝", startTime: "06:00" },
        { name: "夜", startTime: "18:00" },
      ])
      .returning();
    const target = await insertCompleted("2026-07-19", morning.id);

    await repo.undoComplete(target.id, [
      { taskId: target.id, sectionId: night.id, sortOrder: 500 },
    ]);

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.startedAt).toBeNull();
    expect(after.endedAt).toBeNull();
    expect(after.sectionId).toBe(night.id);
    expect(after.sortOrder).toBe(500);
  });

  // 上の undoStart と同じく単文で書く枝（「今日以外」の判断はユースケース側）
  it("並べ直しが空でも打刻2列をクリアできる", async () => {
    const [morning] = await db
      .insert(sections)
      .values([{ name: "朝", startTime: "06:00" }])
      .returning();
    const target = await insertCompleted("2026-07-18", morning.id);

    await repo.undoComplete(target.id, []);

    const [after] = await repo.listByDate("2026-07-18");
    expect(after.startedAt).toBeNull();
    expect(after.endedAt).toBeNull();
    expect(after.sectionId).toBe(morning.id); // 並べ直さない
  });

  it("並べ直しが失敗したら打刻のクリアも巻き戻る（1トランザクション）", async () => {
    const [morning, night] = await db
      .insert(sections)
      .values([
        { name: "朝", startTime: "06:00" },
        { name: "夜", startTime: "18:00" },
      ])
      .returning();
    const target = await insertCompleted("2026-07-19", morning.id);

    await expect(
      repo.undoComplete(target.id, [
        { taskId: target.id, sectionId: night.id, sortOrder: 500 },
        { taskId: target.id, sectionId: 999999, sortOrder: 600 }, // 存在しないセクション → FK違反
      ])
    ).rejects.toThrow();

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.startedAt).toEqual(startedAt); // 完了のまま巻き戻っている
    expect(after.endedAt).toEqual(endedAt);
    expect(after.sectionId).toBe(morning.id);
  });

  it("復帰（updatePunch）で打刻2列と配置2列が同じトランザクションで戻る", async () => {
    const [morning, night] = await db
      .insert(sections)
      .values([
        { name: "朝", startTime: "06:00" },
        { name: "夜", startTime: "18:00" },
      ])
      .returning();
    const target = await insertCompleted("2026-07-19", morning.id);

    await repo.undoComplete(target.id, [
      { taskId: target.id, sectionId: night.id, sortOrder: 500 },
    ]);
    await repo.updatePunch(target.id, { startedAt, endedAt }, [
      { taskId: target.id, sectionId: morning.id, sortOrder: 1000 },
    ]);

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.startedAt).toEqual(startedAt);
    expect(after.endedAt).toEqual(endedAt);
    expect(after.sectionId).toBe(morning.id);
    expect(after.sortOrder).toBe(1000);
  });

  it("復帰先の sort_order を他タスクが取っていても書き戻せる（同値を許容。§4.7）", async () => {
    const [morning] = await db
      .insert(sections)
      .values([{ name: "朝", startTime: "06:00" }])
      .returning();
    const target = await insertCompleted("2026-07-19", morning.id);
    // 取り消し中に別タスクが復帰先と同じ sort_order（1000）を取る
    await db.insert(tasks).values([
      {
        taskDate: "2026-07-19",
        name: "同値の未実行タスク",
        sortOrder: 1000,
        sectionId: morning.id,
      },
    ]);

    await repo.undoComplete(target.id, [
      { taskId: target.id, sectionId: morning.id, sortOrder: 2000 },
    ]);
    await repo.updatePunch(target.id, { startedAt, endedAt }, [
      { taskId: target.id, sectionId: morning.id, sortOrder: 1000 },
    ]);

    const rows = await repo.listByDate("2026-07-19");
    expect(rows.filter((t) => t.sortOrder === 1000)).toHaveLength(2); // sort_order にユニーク制約は無い
    expect(rows.find((t) => t.id === target.id)?.endedAt).toEqual(endedAt);
  });

  it("未分類（section_id IS NULL）の完了タスクも取り消し・復帰できる", async () => {
    const [night] = await db
      .insert(sections)
      .values([{ name: "夜", startTime: "18:00" }])
      .returning();
    const [target] = await db
      .insert(tasks)
      .values([
        { taskDate: "2026-07-19", name: "未分類の完了タスク", sortOrder: 1000, startedAt, endedAt },
      ])
      .returning();

    await repo.undoComplete(target.id, [
      { taskId: target.id, sectionId: night.id, sortOrder: 1000 },
    ]);
    await repo.updatePunch(target.id, { startedAt, endedAt }, [
      { taskId: target.id, sectionId: null, sortOrder: 1000 },
    ]);

    const [after] = await repo.listByDate("2026-07-19");
    expect(after.sectionId).toBeNull(); // 未分類へ戻る
    expect(after.endedAt).toEqual(endedAt);
  });
});
