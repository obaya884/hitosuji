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

  // 1行書き換え（rename 等）とまとめ更新（relocate・move の振り直し）は**同じ `patch` ヘルパ**を
  // 通り、不在のガードもその中の1行なので代表1件で見る。下の3件はそのガードを共有しない——
  // moveToDate は加算に現在値が要るぶん自前で存在を確かめ、delete とスキップ記録は patch を通らない
  it("rename は何も変えない", async () => {
    const repo = inMemoryTaskRepository(initial());
    await repo.rename(MISSING, "新名");
    expect(repo.rows).toEqual(initial());
  });

  it("moveToDate は何も変えない（先送り回数も増えない）", async () => {
    const repo = inMemoryTaskRepository(initial());
    await repo.moveToDate(
      MISSING,
      { taskDate: TEST_DATE, sortOrder: 5000, countsAsPostpone: true },
      null
    );
    expect(repo.rows).toEqual(initial());
  });

  // スキップの記録は別テーブルへの INSERT なので、tasks が0行更新でも本物は書く（delete も同じ）
  it("moveToDate・delete のスキップ記録は対象の行が無くても残る", async () => {
    const skip = { routineId: 7, taskDate: TEST_DATE };
    const moved = inMemoryTaskRepository(initial());
    await moved.moveToDate(
      MISSING,
      { taskDate: TEST_DATE, sortOrder: 5000, countsAsPostpone: true },
      skip
    );
    expect(moved.rows).toEqual(initial());
    expect(moved.skips).toEqual([skip]);

    const deleted = inMemoryTaskRepository(initial());
    await deleted.delete(MISSING, skip);
    expect(deleted.rows).toEqual(initial());
    expect(deleted.skips).toEqual([skip]);
  });

  it("delete は1行も消さない（末尾の行を巻き添えにしない）", async () => {
    const repo = inMemoryTaskRepository(initial());
    await repo.delete(MISSING, null);
    expect(repo.rows).toEqual(initial());
  });
});
