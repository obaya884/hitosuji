import { describe, expect, it } from "vitest";
import type { Section } from "@/domain/section/section";
import { taskStatus } from "@/domain/task/status";
import { TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { inMemorySectionRepository } from "@/usecases/section/testing/in-memory-repository";
import {
  finishTask,
  restoreCompletion,
  startTask,
  undoComplete,
  undoStart,
  updateTaskPunch,
} from "./punch-usecases";
import { inMemoryTaskRepository } from "./testing/in-memory-repository";

const now = new Date("2026-07-26T09:00:00Z");
const nowClock = "18:00"; // 打刻の HH:MM（自動セクション移動 F-113 の判定に使う）
const today = TEST_DATE;

/**
 * 打刻の依存。セクション0件なら自動セクション移動（F-113）は起きないので、
 * F-201 そのものの検証にはこれを使う
 */
function depsOf(repo: ReturnType<typeof inMemoryTaskRepository>, sections: readonly Section[] = []) {
  return { tasks: repo, sections: inMemorySectionRepository(sections) };
}

function punch(repo: ReturnType<typeof inMemoryTaskRepository>, taskId: number) {
  return startTask(depsOf(repo), { taskId, now, nowClock, today });
}

describe("startTask（F-201: 開始打刻）", () => {
  it("実行中タスクがなければそのまま開始する", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1 })]);
    expect((await punch(repo, 1)).ok).toBe(true);
    expect(repo.rows[0].startedAt).toEqual(now);
  });

  it("実行中・完了タスクは開始できない", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, startedAt: now })]);
    expect(await punch(repo, 1)).toEqual({
      ok: false,
      error: "already_started",
    });
  });

  it("存在しないタスクはエラー", async () => {
    const repo = inMemoryTaskRepository([]);
    expect(await punch(repo, 99)).toEqual({
      ok: false,
      error: "task_not_found",
    });
  });

  it("画面定義書01 §4.2-a: 未分類のタスクを開始すると、開始時刻を含むセクションへ移す", async () => {
    const sections: Section[] = [
      { id: 1, name: "午前", startTime: "09:00", isArchived: false },
      { id: 2, name: "夜", startTime: "18:00", isArchived: false },
    ];
    const repo = inMemoryTaskRepository([task({ id: 1, sectionId: null })]);

    // nowClock = 18:00 なので「夜」へ移る
    const result = await startTask(depsOf(repo, sections), { taskId: 1, now, nowClock, today });

    expect(result.ok).toBe(true);
    expect(repo.rows[0].sectionId).toBe(2);
    expect(repo.rows[0].startedAt).toEqual(now);
  });

  it("画面定義書01 §4.2: 今日以外のタスクを開始しても自動セクション移動はしない", async () => {
    const sections: Section[] = [{ id: 2, name: "夜", startTime: "18:00", isArchived: false }];
    const repo = inMemoryTaskRepository([
      task({ id: 1, taskDate: "2026-07-25", sectionId: null }),
    ]);

    const result = await startTask(depsOf(repo, sections), {
      taskId: 1,
      now,
      nowClock,
      today, // 表示日（今日）とタスクの日付が違う
    });

    expect(result.ok).toBe(true);
    expect(repo.rows[0].sectionId).toBeNull();
  });

  it("画面定義書01 §4.2-a: 割り込みの再開タスクは、移動後のセクションの直下に生成する", async () => {
    const sections: Section[] = [
      { id: 1, name: "午前", startTime: "09:00", isArchived: false },
      { id: 2, name: "夜", startTime: "18:00", isArchived: false },
    ];
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, startedAt: new Date("2026-07-26T08:30:00Z") }), // 実行中
      task({ id: 2, sectionId: null }), // これを開始 → 「夜」へ移る
    ]);

    const result = await startTask(depsOf(repo, sections), { taskId: 2, now, nowClock, today });

    expect(result.ok).toBe(true);
    const resumed = repo.rows.find((r) => r.splitParentId !== null);
    expect(repo.rows.find((r) => r.id === 2)?.sectionId).toBe(2);
    expect(resumed?.sectionId).toBe(2); // 元タスクの「午前」ではなく移動先に付いていく
  });
});

describe("startTask の割り込み（F-201 / データモデル定義書 §4.2）", () => {
  const startedAt = new Date("2026-07-26T08:48:00Z"); // 実績12分になる

  it("実行中タスクを同じ時刻で終了し、開始タスクの直下に再開タスクを作る", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, name: "メールチェック", estimateMinutes: 30, startedAt, sortOrder: 1000 }),
      task({ id: 2, name: "設計書レビュー", sortOrder: 2000 }),
      task({ id: 3, name: "後続タスク", sortOrder: 3000 }),
    ]);

    expect((await punch(repo, 2)).ok).toBe(true);

    const [interrupted, started, , resumed] = repo.rows;
    expect(interrupted.endedAt).toEqual(now); // ①終了
    expect(started.startedAt).toEqual(now); // ③開始
    expect(resumed).toEqual(
      expect.objectContaining({
        name: "メールチェック",
        estimateMinutes: 18, // max(30 − 12, 1)
        splitParentId: 1,
        sortOrder: 2500, // 開始タスク(2000)と後続(3000)の中間 = 直下
        startedAt: null,
      })
    );
  });

  it("再開タスクは開始タスクのセクション・日付に従う（前日の実行中タスクを割り込んだ場合も当日側）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, taskDate: "2026-07-25", sectionId: 9, startedAt, sortOrder: 1000 }),
      task({ id: 2, taskDate: TEST_DATE, sectionId: 3, sortOrder: 5000 }),
    ]);

    await punch(repo, 2);

    const resumed = repo.rows[2];
    expect([resumed.taskDate, resumed.sectionId, resumed.sortOrder]).toEqual([
      TEST_DATE,
      3,
      6000, // 後続がないので開始タスクの +1000
    ]);
    expect(repo.rows[0].endedAt).toEqual(now);
  });

  it("再開タスクの位置は開始タスクと同一セクション内だけで決まる（他セクションの行は挟まない）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 9, startedAt, sortOrder: 1000 }),
      task({ id: 2, sectionId: 3, sortOrder: 5000 }), // 開始タスク
      task({ id: 3, sectionId: 4, sortOrder: 5500 }), // 同一日・別セクション。跨いで挟まってはいけない
    ]);

    await punch(repo, 2);

    // セクション3の末尾なので +1000。絞り込みが壊れると 5250（5000 と 5500 の中間）になる
    expect(repo.rows[3]).toEqual(
      expect.objectContaining({ sectionId: 3, sortOrder: 6000 })
    );
  });

  it("中間値が尽きたら振り直しを伴って再開タスクを挟む（§3.5 の renumber を start へ渡す）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, startedAt, sortOrder: 1000 }),
      task({ id: 2, sortOrder: 2000 }), // 開始タスク
      task({ id: 3, sortOrder: 2001 }), // 直下に隙間が無い
    ]);

    await punch(repo, 2);

    // 開始タスクの直下へ再開タスクが入り、グループ全体が 1000刻みへ振り直される
    expect(repo.rows.map((t) => [t.id, t.sortOrder])).toEqual([
      [1, 1000],
      [2, 2000],
      [3, 4000],
      [4, 3000],
    ]);
  });

  it("見積もり未設定の実行中タスクは、再開タスクも未設定のまま（2026-07-19 オーナー判断）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, estimateMinutes: 0, startedAt, sortOrder: 1000 }),
      task({ id: 2, sortOrder: 2000 }),
    ]);

    await punch(repo, 2);
    expect(repo.rows[2].estimateMinutes).toBe(0);
  });

  it("割り込み後も実行中タスクは全体で1件だけ", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, startedAt, sortOrder: 1000 }),
      task({ id: 2, sortOrder: 2000 }),
    ]);

    await punch(repo, 2);
    expect(repo.rows.filter((t) => taskStatus(t) === "running").map((t) => t.id)).toEqual([2]);
  });

  it("割り込み先の実行中タスクを現在時刻で終了できない（開始≦終了）なら開始せずエラー", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, startedAt: new Date("2026-07-26T10:00:00Z"), sortOrder: 1000 }), // now(09:00) より後に開始
      task({ id: 2, sortOrder: 2000 }),
    ]);

    expect(await punch(repo, 2)).toEqual({ ok: false, error: "ended_before_started" });
    expect(repo.rows.find((t) => t.id === 2)?.startedAt).toBeNull(); // 開始されない
    expect(repo.rows).toHaveLength(2); // 再開タスクも作られない
  });
});

describe("undoStart（F-210: 開始打刻の取り消し）", () => {
  const startedAt = new Date("2026-07-26T08:30:00Z");
  const undo = (
    repo: ReturnType<typeof inMemoryTaskRepository>,
    taskId: number,
    sections: readonly Section[] = []
  ) => undoStart(depsOf(repo, sections), { taskId, nowClock, today });

  it("実行中タスクの started_at を null に戻して未実行にする", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, startedAt })]);
    expect((await undo(repo, 1)).ok).toBe(true);
    expect(repo.rows[0].startedAt).toBeNull();
    expect(taskStatus(repo.rows[0])).toBe("not_started");
  });

  it("未実行・完了タスクは取り消せない", async () => {
    const notStarted = inMemoryTaskRepository([task({ id: 1 })]);
    expect(await undo(notStarted, 1)).toEqual({ ok: false, error: "not_running" });

    const completed = inMemoryTaskRepository([
      task({ id: 1, startedAt, endedAt: new Date("2026-07-26T09:00:00Z") }),
    ]);
    expect(await undo(completed, 1)).toEqual({ ok: false, error: "not_running" });
  });

  it("存在しないタスクはエラー", async () => {
    const repo = inMemoryTaskRepository([]);
    expect(await undo(repo, 99)).toEqual({ ok: false, error: "task_not_found" });
  });

  it("今日のタスクは現在時刻を含むセクションの先頭へ並べ直す（§4.5）", async () => {
    const sections: Section[] = [
      { id: 1, name: "午前", startTime: "09:00", isArchived: false },
      { id: 2, name: "夜", startTime: "18:00", isArchived: false },
    ];
    // nowClock = 18:00 なので「夜」へ移る
    const repo = inMemoryTaskRepository([task({ id: 1, sectionId: 1, startedAt })]);

    expect((await undo(repo, 1, sections)).ok).toBe(true);
    expect(repo.rows[0].sectionId).toBe(2);
    expect(repo.rows[0].startedAt).toBeNull();
  });

  it("今日以外のタスクは並べ直さず打刻のクリアだけ行う（§4.5）", async () => {
    const sections: Section[] = [{ id: 2, name: "夜", startTime: "18:00", isArchived: false }];
    const repo = inMemoryTaskRepository([
      task({ id: 1, taskDate: "2026-07-25", sectionId: 1, startedAt }),
    ]);

    expect((await undo(repo, 1, sections)).ok).toBe(true);
    expect(repo.rows[0].startedAt).toBeNull();
    expect(repo.rows[0].sectionId).toBe(1); // 並べ直さない
  });

  it("割り込みで開始していた場合も波及なし: 直前の完了タスクと再開タスクは残す", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, startedAt, endedAt: new Date("2026-07-26T09:00:00Z"), sortOrder: 1000 }), // 割り込みで終了した直前タスク
      task({ id: 2, startedAt: new Date("2026-07-26T09:00:00Z"), sortOrder: 2000 }), // 割り込みで開始した実行中タスク
      task({ id: 3, splitParentId: 1, sortOrder: 1500 }), // 生成済みの再開タスク（未実行）
    ]);

    expect((await undo(repo, 2)).ok).toBe(true);

    expect(repo.rows.find((r) => r.id === 2)?.startedAt).toBeNull(); // 当該タスクだけ未実行へ
    expect(repo.rows.find((r) => r.id === 1)?.endedAt).not.toBeNull(); // 直前タスクは完了のまま
    expect(repo.rows.find((r) => r.id === 3)).toBeDefined(); // 再開タスクは残る
  });
});

describe("undoComplete（F-212: 完了の取り消し）", () => {
  const startedAt = new Date("2026-07-26T08:30:00Z");
  const endedAt = new Date("2026-07-26T09:00:00Z");
  const completed = { startedAt, endedAt };
  const undo = (
    repo: ReturnType<typeof inMemoryTaskRepository>,
    taskId: number,
    sections: readonly Section[] = []
  ) => undoComplete(depsOf(repo, sections), { taskId, nowClock, today });

  it("完了タスクの started_at・ended_at をともに null に戻して未実行にする（§4.7）", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, ...completed })]);

    expect((await undo(repo, 1)).ok).toBe(true);
    expect(repo.rows[0].startedAt).toBeNull();
    expect(repo.rows[0].endedAt).toBeNull();
    expect(taskStatus(repo.rows[0])).toBe("not_started");
  });

  it("復帰に要る4列（打刻2列・セクション・並び順）を返す（§4.7）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, sortOrder: 1500, ...completed }),
    ]);

    expect(await undo(repo, 1)).toEqual({
      ok: true,
      value: { taskId: 1, startedAt, endedAt, sectionId: 1, sortOrder: 1500 },
    });
  });

  it("未実行・実行中タスクは取り消せない", async () => {
    const notStarted = inMemoryTaskRepository([task({ id: 1 })]);
    expect(await undo(notStarted, 1)).toEqual({ ok: false, error: "not_completed" });

    const running = inMemoryTaskRepository([task({ id: 1, startedAt })]);
    expect(await undo(running, 1)).toEqual({ ok: false, error: "not_completed" });
  });

  it("存在しないタスクはエラー", async () => {
    const repo = inMemoryTaskRepository([]);
    expect(await undo(repo, 99)).toEqual({ ok: false, error: "task_not_found" });
  });

  it("今日のタスクは現在位置（現在時刻を含むセクションの未実行先頭）へ並べ直す（§4.7）", async () => {
    const sections: Section[] = [
      { id: 1, name: "午前", startTime: "09:00", isArchived: false },
      { id: 2, name: "夜", startTime: "18:00", isArchived: false },
    ];
    // nowClock = 18:00 なので「夜」へ移る
    const repo = inMemoryTaskRepository([task({ id: 1, sectionId: 1, ...completed })]);

    expect((await undo(repo, 1, sections)).ok).toBe(true);
    expect(repo.rows[0].sectionId).toBe(2);
    expect(repo.rows[0].startedAt).toBeNull();
    expect(repo.rows[0].endedAt).toBeNull();
  });

  it("他に実行中タスクがあればその直後へ置く（§4.7）", async () => {
    const sections: Section[] = [
      { id: 1, name: "午前", startTime: "09:00", isArchived: false },
      { id: 2, name: "夜", startTime: "18:00", isArchived: false },
    ];
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 2, sortOrder: 5000, ...completed }),
      // 実行中タスクは現在時刻のセクション（夜）ではなく午前にいる
      task({ id: 2, sectionId: 1, sortOrder: 1000, startedAt }),
      task({ id: 3, sectionId: 1, sortOrder: 2000 }),
    ]);

    expect((await undo(repo, 1, sections)).ok).toBe(true);
    expect(repo.rows[0].sectionId).toBe(1);
    expect(repo.rows[0].sortOrder).toBe(1500);
    // 並べ直しは当該タスクだけ（実行中タスク・未実行タスクの位置と打刻は動かさない）
    expect(repo.rows[1]).toMatchObject({ sectionId: 1, sortOrder: 1000, startedAt, endedAt: null });
    expect(repo.rows[2]).toMatchObject({ sectionId: 1, sortOrder: 2000 });
  });

  it("未分類（section_id IS NULL）の完了タスクも現在位置へ移し、スナップショットは null を保つ（§4.7）", async () => {
    const sections: Section[] = [{ id: 2, name: "夜", startTime: "18:00", isArchived: false }];
    const repo = inMemoryTaskRepository([task({ id: 1, sectionId: null, ...completed })]);

    const result = await undo(repo, 1, sections);

    expect(result).toEqual({
      ok: true,
      value: { taskId: 1, startedAt, endedAt, sectionId: null, sortOrder: 1000 },
    });
    expect(repo.rows[0].sectionId).toBe(2); // 未分類からも移る
  });

  // 今日以外は過去日・未来日のいずれも並べ直さない（現在位置・これから領域が定義できないため）
  it.each(["2026-07-25", "2026-07-27"])(
    "今日以外（%s）のタスクは並べ直さず打刻のクリアだけ行う（§4.7）",
    async (taskDate) => {
      const sections: Section[] = [{ id: 2, name: "夜", startTime: "18:00", isArchived: false }];
      const repo = inMemoryTaskRepository([task({ id: 1, taskDate, sectionId: 1, ...completed })]);

      expect((await undo(repo, 1, sections)).ok).toBe(true);
      expect(repo.rows[0].startedAt).toBeNull();
      expect(repo.rows[0].endedAt).toBeNull();
      expect(repo.rows[0].sectionId).toBe(1); // 並べ直さない
    }
  );

  it("中断・割り込みへの波及なし: 再開タスクと直前の完了タスクは残す（§4.7）", async () => {
    // 並べ直しが起きる条件（今日・有効セクションあり）で、波及しないことを確かめる
    const sections: Section[] = [{ id: 2, name: "夜", startTime: "18:00", isArchived: false }];
    const repo = inMemoryTaskRepository([
      // 割り込みで終了した直前タスク（取り消し対象）
      task({ id: 1, sectionId: 2, sortOrder: 1000, ...completed }),
      // 生成済みの再開タスク（未実行）。移動先セクションにいるが動かさない
      task({ id: 2, sectionId: 2, sortOrder: 1500, splitParentId: 1 }),
      // 割り込んだ側（完了）
      task({ id: 3, sectionId: 2, sortOrder: 2000, ...completed }),
    ]);

    expect((await undo(repo, 1, sections)).ok).toBe(true);

    expect(repo.rows.find((r) => r.id === 1)?.endedAt).toBeNull(); // 当該タスクだけ未実行へ
    // 再開タスクは打刻・位置ともそのまま残る
    expect(repo.rows.find((r) => r.id === 2)).toMatchObject({
      sortOrder: 1500,
      startedAt: null,
      endedAt: null,
    });
    // 割り込んだ側は完了のまま（位置も動かさない）
    expect(repo.rows.find((r) => r.id === 3)).toMatchObject({ sortOrder: 2000, endedAt });
  });
});

describe("restoreCompletion（F-212: 完了の取り消しの取り消し）", () => {
  const snapshot = {
    taskId: 1,
    startedAt: new Date("2026-07-26T08:30:00Z"),
    endedAt: new Date("2026-07-26T09:00:00Z"),
    sectionId: 3,
    sortOrder: 1500,
  } as const;

  it("スナップショットの4列だけを書き戻して完了状態へ復帰させる（§4.7）", async () => {
    // 取り消し済み（未実行で別セクションへ移った状態）から復帰させる
    const uncompleted = task({ id: 1, sectionId: 9, sortOrder: 4000 });
    const repo = inMemoryTaskRepository([uncompleted]);

    expect(await restoreCompletion(repo, snapshot)).toEqual({ ok: true, value: 1 });
    // 4列以外（名前・見積もり・先送り回数など）は巻き込まない
    expect(repo.rows[0]).toEqual({
      ...uncompleted,
      startedAt: snapshot.startedAt,
      endedAt: snapshot.endedAt,
      sectionId: 3,
      sortOrder: 1500,
    });
    expect(taskStatus(repo.rows[0])).toBe("completed");
  });

  it("未分類（section_id IS NULL）へも戻せる（§4.7）", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, sectionId: 2, sortOrder: 4000 })]);

    expect((await restoreCompletion(repo, { ...snapshot, sectionId: null })).ok).toBe(true);
    expect(repo.rows[0].sectionId).toBeNull();
  });

  it("復帰までの間に他タスクが同じ sort_order を取っていてもそのまま書き戻す（§4.7）", async () => {
    const other = task({ id: 2, sectionId: 3, sortOrder: 1500 }); // 取り消し中に同値を取った未実行タスク
    const repo = inMemoryTaskRepository([task({ id: 1, sectionId: 9, sortOrder: 4000 }), other]);

    expect((await restoreCompletion(repo, snapshot)).ok).toBe(true);
    expect(repo.rows[0]).toMatchObject({ sectionId: 3, sortOrder: 1500 });
    expect(repo.rows[1]).toEqual(other); // 同値のまま。相手を動かしたり振り直したりしない
  });

  it("復帰までの間にタスクが消えていればエラー（他タスクは触らない）", async () => {
    const other = task({ id: 2 });
    const repo = inMemoryTaskRepository([other]);

    expect(await restoreCompletion(repo, snapshot)).toEqual({
      ok: false,
      error: "task_not_found",
    });
    expect(repo.rows).toEqual([other]); // 打刻・位置とも書き換えない
  });
});

describe("finishTask（F-201: 終了打刻）", () => {
  it("実行中タスクを終了する", async () => {
    const startedAt = new Date("2026-07-26T08:30:00Z");
    const repo = inMemoryTaskRepository([task({ id: 1, startedAt })]);

    expect((await finishTask(repo, { taskId: 1, now })).ok).toBe(true);
    expect(repo.rows[0].endedAt).toEqual(now);
  });

  it("未実行タスクは終了できない", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1 })]);
    expect(await finishTask(repo, { taskId: 1, now })).toEqual({
      ok: false,
      error: "not_running",
    });
  });

  it("開始より前の時刻では終了できない（開始 ≦ 終了）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, startedAt: new Date("2026-07-26T09:30:00Z") }),
    ]);
    expect(await finishTask(repo, { taskId: 1, now })).toEqual({
      ok: false,
      error: "ended_before_started",
    });
  });

  it("存在しないタスクは終了できない", async () => {
    const repo = inMemoryTaskRepository([]);
    expect(await finishTask(repo, { taskId: 99, now })).toEqual({
      ok: false,
      error: "task_not_found",
    });
  });
});

describe("updateTaskPunch（F-203: 打刻時刻の修正）", () => {
  const startedAt = new Date("2026-07-26T08:00:00Z");
  const endedAt = new Date("2026-07-26T08:30:00Z");

  /** 修正後の開始時刻に対応する HH:MM（クライアントが整形して送る値の代わり） */
  const clockOf = (at: Date) =>
    at.toLocaleTimeString("en-GB", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });

  function editPunch(
    repo: ReturnType<typeof inMemoryTaskRepository>,
    input: Readonly<{ taskId: number; startedAt: Date; endedAt: Date | null }>,
    sections: readonly Section[] = []
  ) {
    return updateTaskPunch(depsOf(repo, sections), {
      ...input,
      startClock: clockOf(input.startedAt),
      today,
    });
  }

  it("開始・終了時刻を書き換える", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, startedAt, endedAt })]);
    const newStart = new Date("2026-07-26T07:45:00Z");

    expect((await editPunch(repo, { taskId: 1, startedAt: newStart, endedAt })).ok).toBe(true);
    expect(repo.rows[0].startedAt).toEqual(newStart);
  });

  it("実行中タスク（終了なし）の開始時刻も修正できる", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, startedAt })]);
    const newStart = new Date("2026-07-26T07:30:00Z");

    expect((await editPunch(repo, { taskId: 1, startedAt: newStart, endedAt: null })).ok).toBe(true);
    expect(repo.rows[0].endedAt).toBeNull();
  });

  it("終了が開始より前になる修正は拒否する（サーバ側でも再検証する）", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1, startedAt, endedAt })]);

    expect(
      await editPunch(repo, {
        taskId: 1,
        startedAt: new Date("2026-07-26T09:00:00Z"),
        endedAt,
      })
    ).toEqual({ ok: false, error: "ended_before_started" });
    expect(repo.rows[0].startedAt).toEqual(startedAt);
  });

  it("未実行タスクの打刻は修正できない", async () => {
    const repo = inMemoryTaskRepository([task({ id: 1 })]);
    expect(await editPunch(repo, { taskId: 1, startedAt, endedAt: null })).toEqual({
      ok: false,
      error: "not_running",
    });
  });

  it("存在しないタスクの打刻は修正できない", async () => {
    const repo = inMemoryTaskRepository([]);
    expect(await editPunch(repo, { taskId: 99, startedAt, endedAt })).toEqual({
      ok: false,
      error: "task_not_found",
    });
  });

  // 画面定義書01 §4.2-c: 開始時刻を修正したら、修正後の時刻を含むセクションへ移す
  const sections: Section[] = [
    { id: 1, name: "午前", startTime: "09:00", isArchived: false },
    { id: 2, name: "午後", startTime: "12:00", isArchived: false },
  ];

  it("開始時刻の修正で、修正後の時刻を含むセクションへ移る（完了タスクでも移る）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, sortOrder: 1000, startedAt, endedAt }),
    ]);
    const newStart = new Date("2026-07-26T03:10:00Z"); // JST 12:10

    await editPunch(repo, { taskId: 1, startedAt: newStart, endedAt }, sections);

    expect(repo.rows[0].sectionId).toBe(2);
  });

  it("終了時刻だけの修正では移動しない（帰属は「いつ始めたか」で決める）", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, sectionId: 1, sortOrder: 1000, startedAt, endedAt }),
    ]);

    await editPunch(
      repo,
      { taskId: 1, startedAt, endedAt: new Date("2026-07-26T15:00:00Z") },
      sections
    );

    expect(repo.rows[0].sectionId).toBe(1);
  });

  it("今日以外の日付のタスクは移動しない", async () => {
    const repo = inMemoryTaskRepository([
      task({ id: 1, taskDate: "2026-07-25", sectionId: 1, sortOrder: 1000, startedAt, endedAt }),
    ]);
    const newStart = new Date("2026-07-26T03:10:00Z");

    await editPunch(repo, { taskId: 1, startedAt: newStart, endedAt }, sections);

    expect(repo.rows[0].sectionId).toBe(1);
  });
});
