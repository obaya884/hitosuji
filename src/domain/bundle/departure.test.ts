import { describe, expect, it } from "vitest";
import { atJst } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { detectBundleDeparture } from "./departure";

describe("detectBundleDeparture（要件定義書 §5.6: 割り込みの検知）", () => {
  it("直前に実行したメンバーがあり、非メンバーを開始し、未完了が残っていれば知らせる", () => {
    const tasks = [
      task({ id: 1, bundleId: 5, startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      task({ id: 2, bundleId: 5 }),
      task({ id: 3, bundleId: null }),
    ];
    expect(detectBundleDeparture(tasks, { id: 3, bundleId: null })).toEqual({
      bundleId: 5,
      remaining: 1,
    });
  });

  it("直前に実行したタスクが非メンバーなら知らせない（一度離れたら黙る）", () => {
    const tasks = [
      task({ id: 1, bundleId: 5, startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      task({ id: 2, bundleId: null, startedAt: atJst("07:00"), endedAt: atJst("07:20") }),
      task({ id: 3, bundleId: null }),
    ];
    expect(detectBundleDeparture(tasks, { id: 3, bundleId: null })).toBe(null);
  });

  it("直前が非メンバーなら、開始したタスク自身が別バンドルのメンバーでも知らせない（条件1: 直前がAに属すること）", () => {
    // 開始したタスク自身のバンドル(7)が非nullなので条件2の等値比較だけでは弾けない。
    // 直前(非メンバー)のバンドル(null)を無関係な非メンバーの未完了(id:3)で「残り」が
    // 1件以上に見える形にし、条件1を消すと誤って知らせてしまうことを検出できるようにする
    const tasks = [
      task({ id: 1, bundleId: null, startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      task({ id: 2, bundleId: 7 }),
      task({ id: 3, bundleId: null }),
    ];
    expect(detectBundleDeparture(tasks, { id: 2, bundleId: 7 })).toBe(null);
  });

  it("同じバンドルの別メンバーを開始したときは知らせない", () => {
    const tasks = [
      task({ id: 1, bundleId: 5, startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      task({ id: 2, bundleId: 5 }),
    ];
    expect(detectBundleDeparture(tasks, { id: 2, bundleId: 5 })).toBe(null);
  });

  it("中断した残りの再開も知らせない（再開タスクはバンドルを引き継ぐため）", () => {
    const tasks = [
      task({ id: 1, bundleId: 5, startedAt: atJst("06:30"), endedAt: atJst("06:40") }),
      task({ id: 2, bundleId: 5, splitParentId: 1 }),
    ];
    expect(detectBundleDeparture(tasks, { id: 2, bundleId: 5 })).toBe(null);
  });

  it("バンドルのメンバーが全部終わっていれば知らせない", () => {
    const tasks = [
      task({ id: 1, bundleId: 5, startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      task({ id: 2, bundleId: null }),
    ];
    expect(detectBundleDeparture(tasks, { id: 2, bundleId: null })).toBe(null);
  });

  it("実行中のメンバーは未完了として数える", () => {
    const tasks = [
      task({ id: 1, bundleId: 5, startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      task({ id: 2, bundleId: 5, startedAt: atJst("06:50") }),
      task({ id: 3, bundleId: 5 }),
      task({ id: 4, bundleId: null }),
    ];
    expect(detectBundleDeparture(tasks, { id: 4, bundleId: null })).toEqual({
      bundleId: 5,
      remaining: 2,
    });
  });

  it("打刻がまだ1件も無ければ知らせない", () => {
    const tasks = [task({ id: 1, bundleId: 5 }), task({ id: 2, bundleId: null })];
    expect(detectBundleDeparture(tasks, { id: 2, bundleId: null })).toBe(null);
  });

  it("複製して開始（新しい行がまだ無い）でも直前のメンバーから判定する", () => {
    const tasks = [
      task({ id: 1, bundleId: 5, startedAt: atJst("06:30"), endedAt: atJst("06:48") }),
      task({ id: 2, bundleId: 5 }),
    ];
    expect(detectBundleDeparture(tasks, { id: null, bundleId: null })).toEqual({
      bundleId: 5,
      remaining: 1,
    });
  });

  it("直前の判定は開始時刻が最大のもので決まる（一覧の並び順ではない）", () => {
    // 一覧では非メンバー（id:2）が後ろに並ぶが、開始時刻はメンバー（id:1）の方が遅い。
    // 並び順で決めていると「直前は非メンバー」と誤判定して黙ってしまう
    const tasks = [
      task({ id: 1, bundleId: 5, startedAt: atJst("08:00"), endedAt: atJst("08:10") }),
      task({ id: 2, bundleId: null, startedAt: atJst("06:00"), endedAt: atJst("06:10") }),
      task({ id: 3, bundleId: 5 }),
      task({ id: 4, bundleId: null }),
    ];
    expect(detectBundleDeparture(tasks, { id: 4, bundleId: null })).toEqual({
      bundleId: 5,
      remaining: 1,
    });
  });
});
