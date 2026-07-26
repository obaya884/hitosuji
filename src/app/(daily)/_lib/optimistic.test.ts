import { describe, expect, it } from "vitest";
import type { Section } from "@/domain/section/section";
import type { DailyGroup } from "@/domain/task/daily-list";
import type { Task } from "@/domain/task/task";
import { at, sectionGroup, task, TEST_DATE, unclassifiedGroup } from "../_testing/factories";
import { applyOptimisticAction, optimisticTask, type OptimisticAction } from "./optimistic";

// 見るのは「どのアクションが何をどこまで即時に反映するか」（画面定義書01 / N-01）。
// グループ操作そのもの（挿入位置・境界の丸め）は domain/task/daily-list のテストが持つ。
const MORNING: Section = { id: 1, name: "朝", startTime: "06:00", isArchived: false };

const NOT_STARTED = task({ id: 11, name: "未実行" });
const RUNNING = task({ id: 12, name: "実行中", sectionId: 1, startedAt: at("09:00") });
const COMPLETED = task({
  id: 13,
  name: "完了",
  sectionId: 1,
  startedAt: at("08:00"),
  endedAt: at("08:30"),
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

  it("start は開始打刻を入れる（割り込みの終了・再開タスク生成はサーバ確定後 / O-2）", () => {
    const applied = apply({ type: "start", id: 11, at: at("10:00") });

    expect(find(applied, 11)).toEqual({ ...NOT_STARTED, startedAt: at("10:00") });
    // 既存の実行中タスクには触れない（割り込みの終了はサーバの1トランザクション）
    expect(find(applied, 12)).toEqual(RUNNING);
    // 現在位置への自動セクション移動（§4.2-a / F-113 規則a）もサーバ確定後。まだ未分類に留まる
    expect(applied[0].tasks.map((t) => t.id)).toEqual([11]);
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
    const applied = apply({ type: "finish", id: 12, at: at("11:00") });

    expect(find(applied, 12)).toEqual({ ...RUNNING, endedAt: at("11:00") });
  });

  it("punch は開始・終了を同時に差し替える（F-203 の打刻修正）", () => {
    const applied = apply({
      type: "punch",
      id: 13,
      startedAt: at("07:00"),
      endedAt: at("07:30"),
    });

    expect(find(applied, 13)).toEqual({
      ...COMPLETED,
      startedAt: at("07:00"),
      endedAt: at("07:30"),
    });
  });

  it("punch は終了 null（実行中へ戻す修正）も送れる", () => {
    const applied = apply({ type: "punch", id: 13, startedAt: at("07:00"), endedAt: null });

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
    expect(applied[0].tasks).toEqual([NOT_STARTED]); // 全グループを写す実装なので他グループの不変も見る
  });

  // remove は唯一 domain の `withTask*` に委譲せず直書きしている枝なので、
  // 「居ないID」と不変性はこの枝で確かめる（他の枝は domain 側のテストが持つ）
  it("対象が居ない remove でも壊れない（サーバ確定で既に消えた行への操作）", () => {
    const applied = apply({ type: "remove", id: 999 });

    expect(applied.flatMap((g) => g.tasks).map((t) => t.id)).toEqual([11, 12, 13]);
  });

  it("元のグループ列を書き換えない（useOptimistic は前の状態を保つ）", () => {
    const before = groups();

    applyOptimisticAction(before, { type: "remove", id: 11 });

    expect(before[0].tasks.map((t) => t.id)).toEqual([11]);
  });
});

describe("optimisticTask（サーバ確定前の仮タスク）", () => {
  it("負のIDで未確定と分かるようにし、未分類の末尾（画面定義書01 §3.4）へ置く形で作る", () => {
    // 全項目を固定する。既定値の入れ忘れは仮の行と確定後の行の差になって表に出るため
    expect(optimisticTask(TEST_DATE, "買い物", 1000)).toEqual({
      id: -1000,
      taskDate: TEST_DATE,
      name: "買い物",
      estimateMinutes: 0,
      sectionId: null,
      modeId: null,
      projectId: null,
      sortOrder: Number.MAX_SAFE_INTEGER,
      startedAt: null,
      endedAt: null,
      comment: null,
      routineId: null,
      splitParentId: null,
      postponedCount: 0,
    });
  });

  it("名前はそのまま持つ（トリムは呼び出し側＝クイック追加欄の責務）", () => {
    expect(optimisticTask(TEST_DATE, "  ", 1000).name).toBe("  ");
  });
});
