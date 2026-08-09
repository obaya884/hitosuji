import { describe, expect, it } from "vitest";

import { TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { inMemoryTaskRepository } from "./in-memory-repository";

/**
 * 偽物が本物と同じ契約（`UPDATE / DELETE ... WHERE id = ?` が0行で静かに終わる）を持つことを固定する。
 * 存在の検査はユースケース側にあるので通常ここへは在る id しか来ないが、揃えておかないと
 * **本物なら何も起きない操作が偽物では別の行を壊し**、テストだけが嘘の結果を返す（FB-70 の補足）。
 * 対象を末尾以外にしていないと、`delete` の巻き添え（`splice(-1, 1)`）を見逃す
 */
describe("inMemoryTaskRepository: 存在しない id への書き込み（本物の0行更新と同じ扱い）", () => {
  /** 2行のどちらとも違う id。削除済みのタスクを渡した状況を表す */
  const MISSING = 3;
  const initial = () => [task({ id: 1, name: "先頭" }), task({ id: 2, name: "末尾" })];

  it("rename は何も変えない", async () => {
    const repo = inMemoryTaskRepository(initial());
    await repo.rename(MISSING, "新名");
    expect(repo.rows).toEqual(initial());
  });

  it("updateEstimate は何も変えない", async () => {
    const repo = inMemoryTaskRepository(initial());
    await repo.updateEstimate(MISSING, 45);
    expect(repo.rows).toEqual(initial());
  });

  it("updateComment は何も変えない", async () => {
    const repo = inMemoryTaskRepository(initial());
    await repo.updateComment(MISSING, "書き換え");
    expect(repo.rows).toEqual(initial());
  });

  it("updateClassification は何も変えない", async () => {
    const repo = inMemoryTaskRepository(initial());
    await repo.updateClassification(MISSING, { modeId: 7 });
    expect(repo.rows).toEqual(initial());
  });

  it("postpone は何も変えない（先送り回数も増えない）", async () => {
    const repo = inMemoryTaskRepository(initial());
    await repo.postpone(MISSING, { taskDate: TEST_DATE, sortOrder: 5000 }, null);
    expect(repo.rows).toEqual(initial());
  });

  // スキップの記録は別テーブルへの INSERT なので、tasks が0行更新でも本物は書く（delete も同じ）
  it("postpone・delete のスキップ記録は対象の行が無くても残る", async () => {
    const skip = { routineId: 7, taskDate: TEST_DATE };
    const postponed = inMemoryTaskRepository(initial());
    await postponed.postpone(MISSING, { taskDate: TEST_DATE, sortOrder: 5000 }, skip);
    expect(postponed.rows).toEqual(initial());
    expect(postponed.skips).toEqual([skip]);

    const deleted = inMemoryTaskRepository(initial());
    await deleted.delete(MISSING, skip);
    expect(deleted.rows).toEqual(initial());
    expect(deleted.skips).toEqual([skip]);
  });

  it("relocate は何も変えない（まとめ更新に混じっても他の行へ書かない）", async () => {
    const repo = inMemoryTaskRepository(initial());
    await repo.relocate([{ taskId: MISSING, sectionId: 1, sortOrder: 5000 }]);
    expect(repo.rows).toEqual(initial());
  });

  it("move の振り直しは何も変えない（まとめ更新のもう一方も同じ扱い）", async () => {
    const repo = inMemoryTaskRepository(initial());
    await repo.move({
      taskId: 1,
      sectionId: null,
      sortOrder: 2000,
      renumber: [{ taskId: MISSING, sortOrder: 9000 }],
    });
    // 振り直しの対象（存在しない）は無視され、移動そのものは効く
    expect(repo.rows.map((r) => r.sortOrder)).toEqual([2000, initial()[1].sortOrder]);
  });

  it("delete は1行も消さない（末尾の行を巻き添えにしない）", async () => {
    const repo = inMemoryTaskRepository(initial());
    await repo.delete(MISSING, null);
    expect(repo.rows).toEqual(initial());
  });
});
