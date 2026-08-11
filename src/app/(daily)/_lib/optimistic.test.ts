import { describe, expect, it } from "vitest";
import type { Section } from "@/domain/section/section";
import type { DailyGroup } from "@/domain/task/daily-list";
import type { Task } from "@/domain/task/task";
import { atJst, TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { sectionGroup, unclassifiedGroup } from "../_testing/factories";
import { applyOptimisticAction, optimisticTask, type OptimisticAction } from "./optimistic";

// 見るのは「どのアクションが何をどこまで即時に反映するか」（画面定義書01 / N-01）。
// グループ操作そのもの（挿入位置・境界の丸め・存在しないIDの扱い・不変性）は
// domain/task/daily-list のテストが持つ。
const MORNING: Section = { id: 1, name: "朝", startTime: "06:00", isArchived: false };

const NOT_STARTED = task({ id: 11, name: "未実行" });
const RUNNING = task({ id: 12, name: "実行中", sectionId: 1, startedAt: atJst("09:00") });
const COMPLETED = task({
  id: 13,
  name: "完了",
  sectionId: 1,
  startedAt: atJst("08:00"),
  endedAt: atJst("08:30"),
});

function groups(): DailyGroup[] {
  return [
    unclassifiedGroup([NOT_STARTED]),
    sectionGroup(MORNING, "12:00", [RUNNING, COMPLETED]),
  ];
}

/** アクション適用後のタスクを id で引く（グループを跨いで探す） */
function find(applied: readonly DailyGroup[], id: number): Task | undefined {
  return applied.flatMap((g) => g.tasks).find((t) => t.id === id);
}

function apply(action: OptimisticAction): DailyGroup[] {
  return applyOptimisticAction(groups(), action);
}

describe("applyOptimisticAction の即時反映（N-01 / 00_共通 §4）", () => {
  it("append は未分類の末尾へ仮タスクを足す（画面定義書01 §3.4）", () => {
    const added = task({ id: -1, name: "追加" });

    const applied = apply({ type: "append", task: added });

    expect(applied[0].tasks.map((t) => t.id)).toEqual([11, -1]);
  });

  it("rename は名前だけを差し替える", () => {
    const applied = apply({ type: "rename", id: 11, name: "新しい名前" });

    expect(find(applied, 11)).toEqual({ ...NOT_STARTED, name: "新しい名前" });
  });

  it("estimate は見積もりだけを差し替える", () => {
    const applied = apply({ type: "estimate", id: 11, minutes: 45 });

    expect(find(applied, 11)).toEqual({ ...NOT_STARTED, estimateMinutes: 45 });
  });

  it("comment はコメントだけを差し替える（O-16 / F-206）", () => {
    const applied = apply({ type: "comment", id: 11, comment: "元データ探しに手間取った" });

    expect(find(applied, 11)).toEqual({ ...NOT_STARTED, comment: "元データ探しに手間取った" });
  });

  it("comment に null を渡すとコメントが消える（空で確定＝未設定へ戻す）", () => {
    // 既定のタスクはコメントを持たないので、一度書いてから消す（消えたことを実際に見るため）
    const written = apply({ type: "comment", id: 11, comment: "書いてあった" });

    const cleared = applyOptimisticAction(written, { type: "comment", id: 11, comment: null });

    expect(find(cleared, 11)).toEqual({ ...NOT_STARTED, comment: null });
  });

  it("highlight はハイライトだけを差し替える（O-17 / F-118）", () => {
    const applied = apply({ type: "highlight", id: 11, highlighted: true });

    expect(find(applied, 11)).toEqual({ ...NOT_STARTED, highlighted: true });
  });

  it("highlight に false を渡すとハイライトが外れる", () => {
    const marked = apply({ type: "highlight", id: 11, highlighted: true });

    const cleared = applyOptimisticAction(marked, {
      type: "highlight",
      id: 11,
      highlighted: false,
    });

    expect(find(cleared, 11)).toEqual({ ...NOT_STARTED, highlighted: false });
  });

  it("start は開始打刻と割り込み相手の終了を同時に入れる（再開タスク生成はサーバ確定後 / O-2）", () => {
    const applied = apply({ type: "start", id: 11, at: atJst("10:00") });

    expect(find(applied, 11)).toEqual({ ...NOT_STARTED, startedAt: atJst("10:00") });
    // 割り込み相手は開始と同じ時刻で終了する（サーバの確定結果と一致する）
    expect(find(applied, 12)).toEqual({ ...RUNNING, endedAt: atJst("10:00") });
    // この段で言えるのは「グループの並びに触れていない」ことまで
    // （完了タスクが動かないこと自体は画面定義書01 §4.2 のサーバ側の規則）
    expect(applied[1].tasks.map((t) => t.id)).toEqual([12, 13]);
    // 再開タスクの生成と、現在位置への自動セクション移動（§4.2-a / F-113 規則a）はサーバ確定後。
    // まだ未分類に1件だけ留まる
    expect(applied.flatMap((g) => g.tasks)).toHaveLength(3);
    expect(applied[0].tasks.map((t) => t.id)).toEqual([11]);
  });

  // 画面は未実行の行にしか start を出さない（`daily-board.tsx` の `punch`）が、
  // 公開型 `OptimisticAction` としては受け取りうるので、自分自身を割り込み相手にしない
  it("start は対象自身を割り込み相手と見なさない（自分を完了に化けさせない）", () => {
    const applied = apply({ type: "start", id: 12, at: atJst("10:00") });

    expect(find(applied, 12)).toEqual({ ...RUNNING, startedAt: atJst("10:00") });
  });

  it("start は実行中タスクが無ければ開始打刻だけを入れる（割り込みでない O-2）", () => {
    const applied = applyOptimisticAction(
      [unclassifiedGroup([NOT_STARTED]), sectionGroup(MORNING, "12:00", [COMPLETED])],
      { type: "start", id: 11, at: atJst("10:00") }
    );

    expect(find(applied, 11)).toEqual({ ...NOT_STARTED, startedAt: atJst("10:00") });
    // 完了タスクを終了させてしまわない（対象は実行中だけ）
    expect(find(applied, 13)).toEqual(COMPLETED);
  });

  it("start は表示日に実行中タスクが居ない割り込み（前日以前・F-209）でも開始打刻だけを入れる", () => {
    // 前日の実行中タスクは当日のグループに現れないので、先取りする相手が画面上に無い
    const applied = applyOptimisticAction([unclassifiedGroup([NOT_STARTED])], {
      type: "start",
      id: 11,
      at: atJst("10:00"),
    });

    expect(applied.flatMap((g) => g.tasks)).toEqual([{ ...NOT_STARTED, startedAt: atJst("10:00") }]);
  });

  it("unstart は開始打刻だけ消す（未実行への並べ直しはサーバ確定後 / O-13）", () => {
    const applied = apply({ type: "unstart", id: 12 });

    expect(find(applied, 12)).toEqual({ ...RUNNING, startedAt: null });
    // 並べ直しを待つあいだも位置はセクションのまま
    expect(applied[1].tasks.map((t) => t.id)).toEqual([12, 13]);
  });

  it("uncomplete は打刻2列をまとめて消す（並べ直しはサーバ確定後 / O-15）", () => {
    const applied = apply({ type: "uncomplete", id: 13 });

    expect(find(applied, 13)).toEqual({ ...COMPLETED, startedAt: null, endedAt: null });
    expect(applied[1].tasks.map((t) => t.id)).toEqual([12, 13]);
  });

  it("finish は終了打刻だけを入れる（開始打刻は保つ）", () => {
    const applied = apply({ type: "finish", id: 12, at: atJst("11:00") });

    expect(find(applied, 12)).toEqual({ ...RUNNING, endedAt: atJst("11:00") });
  });

  it("punch は開始・終了を同時に差し替える（F-203 の打刻修正）", () => {
    const applied = apply({
      type: "punch",
      id: 13,
      startedAt: atJst("07:00"),
      endedAt: atJst("07:30"),
    });

    expect(find(applied, 13)).toEqual({
      ...COMPLETED,
      startedAt: atJst("07:00"),
      endedAt: atJst("07:30"),
    });
  });

  it("punch は終了 null（実行中へ戻す修正）も送れる", () => {
    const applied = apply({ type: "punch", id: 13, startedAt: atJst("07:00"), endedAt: null });

    expect(find(applied, 13)?.endedAt).toBeNull();
  });

  it("move は表示上の並びと所属だけ変え、sort_order の採番はサーバへ委ねる（O-6 / §3.5）", () => {
    const applied = apply({ type: "move", id: 11, destination: { sectionId: 1, index: 0 } });

    expect(applied[0].tasks).toEqual([]);
    expect(applied[1].tasks.map((t) => t.id)).toEqual([11, 12, 13]);
    // sectionId 以外は動かさない（sortOrder を先に振ると確定値とずれる）
    expect(find(applied, 11)).toEqual({ ...NOT_STARTED, sectionId: 1 });
  });

  it("mode は未設定（null）への変更も反映する（O-5）", () => {
    const assigned = apply({ type: "mode", id: 11, modeId: 3 });
    const cleared = applyOptimisticAction(assigned, { type: "mode", id: 11, modeId: null });

    expect(find(assigned, 11)).toEqual({ ...NOT_STARTED, modeId: 3 });
    expect(find(cleared, 11)).toEqual(NOT_STARTED);
  });

  it("project も同じ規則で反映する（O-5 / F-402）", () => {
    const applied = apply({ type: "project", id: 11, projectId: 5 });

    expect(find(applied, 11)).toEqual({ ...NOT_STARTED, projectId: 5 });
  });

  it("remove は行を消す（削除 O-8）", () => {
    const applied = apply({ type: "remove", id: 13 });

    expect(find(applied, 13)).toBeUndefined();
    expect(applied[1].tasks.map((t) => t.id)).toEqual([12]);
  });
});

describe("optimisticTask（サーバ確定前の仮タスク）", () => {
  it("負のIDで未確定と分かるようにし、未分類の末尾（画面定義書01 §3.4）へ置く形で作る", () => {
    // 全項目を固定する。既定値の入れ忘れは仮の行と確定後の行の差になって表に出るため
    expect(optimisticTask(TEST_DATE, "買い物", 7)).toEqual({
      id: -7,
      taskDate: TEST_DATE,
      name: "買い物",
      estimateMinutes: 0,
      sectionId: null,
      modeId: null,
      projectId: null,
      bundleId: null,
      sortOrder: Number.MAX_SAFE_INTEGER,
      startedAt: null,
      endedAt: null,
      comment: null,
      highlighted: false,
      routineId: null,
      splitParentId: null,
      postponedCount: 0,
    });
  });

  it("名前はそのまま持つ（トリムは呼び出し側＝クイック追加欄の責務）", () => {
    expect(optimisticTask(TEST_DATE, "  ", 1).name).toBe("  ");
  });
});
