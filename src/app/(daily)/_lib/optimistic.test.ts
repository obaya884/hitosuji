import { describe, expect, it } from "vitest";
import type { Section } from "@/domain/section/section";
import type { DailyGroup } from "@/domain/task/daily-list";
import type { Task } from "@/domain/task/task";
import { atJst, TEST_DATE } from "@/domain/shared/testing/clock";
import { task } from "@/domain/task/testing/task";
import { sectionGroup, unclassifiedGroup } from "../_testing/factories";
import {
  applyOptimisticAction,
  isProvisional,
  optimisticTask,
  type OptimisticAction,
  type OptimisticContext,
} from "./optimistic";

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

/**
 * 今日でない表示日の文脈。規則a / b と取り消しの並べ直しが当たらないので、値の差し替えだけを見られる
 * （配置の計画を当てる場合は下の「今日の表示」の describe が見る）
 */
const NOT_TODAY: OptimisticContext = {
  sections: [MORNING],
  isToday: false,
  nowClock: "10:00",
  staleRunningTask: null,
};

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
  return applyOptimisticAction(groups(), action, NOT_TODAY);
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

  it("url は URL だけを差し替え、null で消える（O-18 / F-125）", () => {
    const written = apply({ type: "url", id: 11, url: "https://example.com/doc" });
    expect(find(written, 11)).toEqual({ ...NOT_STARTED, url: "https://example.com/doc" });

    const cleared = applyOptimisticAction(written, { type: "url", id: 11, url: null }, NOT_TODAY);
    expect(find(cleared, 11)).toEqual({ ...NOT_STARTED, url: null });
  });

  it("comment に null を渡すとコメントが消える（空で確定＝未設定へ戻す）", () => {
    // 既定のタスクはコメントを持たないので、一度書いてから消す（消えたことを実際に見るため）
    const written = apply({ type: "comment", id: 11, comment: "書いてあった" });

    const cleared = applyOptimisticAction(written, { type: "comment", id: 11, comment: null }, NOT_TODAY);

    expect(find(cleared, 11)).toEqual({ ...NOT_STARTED, comment: null });
  });

  it("highlight はハイライトだけを差し替える（O-17 / F-118）", () => {
    const applied = apply({ type: "highlight", id: 11, highlighted: true });

    expect(find(applied, 11)).toEqual({ ...NOT_STARTED, highlighted: true });
  });

  it("highlight に false を渡すとハイライトが外れる", () => {
    const marked = apply({ type: "highlight", id: 11, highlighted: true });

    const cleared = applyOptimisticAction(
      marked,
      { type: "highlight", id: 11, highlighted: false },
      NOT_TODAY
    );

    expect(find(cleared, 11)).toEqual({ ...NOT_STARTED, highlighted: false });
  });

  it("start は開始打刻・割り込み相手の終了・再開タスクの仮の行を同時に出す（O-2）", () => {
    const applied = apply({ type: "start", id: 11, at: atJst("10:00"), resumeSeq: 7 });

    expect(find(applied, 11)).toEqual({ ...NOT_STARTED, startedAt: atJst("10:00") });
    // 割り込み相手は開始と同じ時刻で終了する（サーバの確定結果と一致する）
    expect(find(applied, 12)).toEqual({ ...RUNNING, endedAt: atJst("10:00") });
    // 再開タスクは開始タスクの直下（今日でないので開始タスクは未分類に留まる。規則a は今日だけ）
    expect(applied[0].tasks.map((t) => t.id)).toEqual([11, -7]);
    expect(find(applied, -7)).toMatchObject({
      name: "実行中（再開）",
      splitParentId: 12,
      sectionId: null,
      startedAt: null,
    });
    expect(applied[1].tasks.map((t) => t.id)).toEqual([12, 13]);
  });

  // 画面は未実行の行にしか start を出さない（`daily-board.tsx` の `punch`）が、
  // 公開型 `OptimisticAction` としては受け取りうるので、自分自身を割り込み相手にしない
  it("start は対象自身を割り込み相手と見なさない（自分を完了に化けさせない）", () => {
    const applied = apply({ type: "start", id: 12, at: atJst("10:00"), resumeSeq: 7 });

    expect(find(applied, 12)).toEqual({ ...RUNNING, startedAt: atJst("10:00") });
  });

  it("start は実行中タスクが無ければ開始打刻だけを入れる（割り込みでない O-2）", () => {
    const applied = applyOptimisticAction(
      [unclassifiedGroup([NOT_STARTED]), sectionGroup(MORNING, "12:00", [COMPLETED])],
      { type: "start", id: 11, at: atJst("10:00"), resumeSeq: 7 },
      NOT_TODAY
    );

    expect(find(applied, 11)).toEqual({ ...NOT_STARTED, startedAt: atJst("10:00") });
    // 完了タスクを終了させてしまわない（対象は実行中だけ）。割り込みでないので再開タスクも出さない
    expect(find(applied, 13)).toEqual(COMPLETED);
    expect(find(applied, -7)).toBeUndefined();
  });

  it("unstart は今日でなければ開始打刻を消すだけで並べ直さない（O-13）", () => {
    const applied = apply({ type: "unstart", id: 12, at: atJst("10:00") });

    expect(find(applied, 12)).toEqual({ ...RUNNING, startedAt: null });
    expect(applied[1].tasks.map((t) => t.id)).toEqual([12, 13]);
  });

  it("uncomplete は打刻2列をまとめて消し、今日でなければ並べ直さない（O-15）", () => {
    const applied = apply({ type: "uncomplete", id: 13, at: atJst("10:00") });

    expect(find(applied, 13)).toEqual({ ...COMPLETED, startedAt: null, endedAt: null });
    expect(applied[1].tasks.map((t) => t.id)).toEqual([12, 13]);
  });

  it("finish は終了打刻だけを入れる（開始打刻は保つ）", () => {
    const applied = apply({ type: "finish", id: 12, at: atJst("11:00") });

    expect(find(applied, 12)).toEqual({ ...RUNNING, endedAt: atJst("11:00") });
  });

  it("punch は開始・終了を同時に差し替え、開始時刻が変われば規則c で開始時刻順の位置へ移す（F-203 / §4.2-c）", () => {
    const applied = apply({
      type: "punch",
      id: 13,
      startedAt: atJst("07:00"),
      endedAt: atJst("07:30"),
    });

    expect(find(applied, 13)).toMatchObject({ startedAt: atJst("07:00"), endedAt: atJst("07:30") });
    // 規則c は表示日を問わない。09:00 開始の実行中タスクより前（開始時刻順）へ入る
    expect(applied[1].tasks.map((t) => t.id)).toEqual([13, 12]);
  });

  it("punch で終了時刻だけを変えたときは並びを動かさない（§4.2 の対象外）", () => {
    const applied = apply({
      type: "punch",
      id: 13,
      startedAt: atJst("08:00"),
      endedAt: atJst("08:45"),
    });

    expect(find(applied, 13)).toEqual({ ...COMPLETED, endedAt: atJst("08:45") });
    expect(applied[1].tasks.map((t) => t.id)).toEqual([12, 13]);
  });

  it("punch は終了 null（実行中へ戻す修正）も送れる", () => {
    const applied = apply({ type: "punch", id: 13, startedAt: atJst("07:00"), endedAt: null });

    expect(find(applied, 13)?.endedAt).toBeNull();
  });

  it("move は表示上の並びと所属だけ変え、sort_order の採番はサーバへ委ねる（O-6 / データモデル定義書 §3.5）", () => {
    const applied = apply({ type: "move", id: 11, destination: { sectionId: 1, index: 0 } });

    expect(applied[0].tasks).toEqual([]);
    expect(applied[1].tasks.map((t) => t.id)).toEqual([11, 12, 13]);
    // sectionId 以外は動かさない（sortOrder を先に振ると確定値とずれる）
    expect(find(applied, 11)).toEqual({ ...NOT_STARTED, sectionId: 1 });
  });

  it("mode は未設定（null）への変更も反映する（O-5）", () => {
    const assigned = apply({ type: "mode", id: 11, modeId: 3 });
    const cleared = applyOptimisticAction(assigned, { type: "mode", id: 11, modeId: null }, NOT_TODAY);

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

describe("今日の表示: 配置の計画と規則b を当てる（画面定義書01 §4 冒頭「確定前に出す範囲」）", () => {
  // 位置の規則そのもの（開始時刻順・現在位置・直下）は domain の placement / relocation のテストが見る。
  // ここは「サーバと同じ計画を、確定前の表示へ当てているか」を操作ごとに確かめる
  const NOON: Section = { id: 2, name: "昼", startTime: "12:00", isArchived: false };
  const today = (nowClock: string): OptimisticContext => ({
    sections: [MORNING, NOON],
    isToday: true,
    nowClock,
    staleRunningTask: null,
  });
  const NOT_TODAY_TWO_SECTIONS: OptimisticContext = { ...NOT_TODAY, sections: [MORNING, NOON] };
  const ids = (applied: readonly DailyGroup[]) => applied.map((g) => g.tasks.map((t) => t.id));

  const done = task({ id: 1, sectionId: 1, startedAt: atJst("07:00"), endedAt: atJst("07:30") });
  const later = task({ id: 2, sectionId: 2, name: "昼の予定" });
  const board = (...morningTasks: Task[]): DailyGroup[] => [
    unclassifiedGroup([]),
    sectionGroup(MORNING, "12:00", [done, ...morningTasks]),
    sectionGroup(NOON, "06:00", [later]),
  ];

  it("start は開始タスク自身を規則a で開始時刻のセクションへ移す（§4.2-a）", () => {
    const target = task({ id: 3, sectionId: 1 });
    const applied = applyOptimisticAction(
      board(target),
      { type: "start", id: 3, at: atJst("12:30"), resumeSeq: 7 },
      today("12:30")
    );

    // 昼セクションの未実行タスクより前（打刻済みは時刻順、未実行はその後ろ）
    expect(ids(applied)).toEqual([[], [1], [3, 2]]);
  });

  it("割り込みの再開タスクは、移動した後の開始タスクの直下に出る（§4.2-a）", () => {
    const running = task({ id: 4, sectionId: 1, startedAt: atJst("11:00"), name: "読書" });
    const target = task({ id: 3, sectionId: 1 });
    const applied = applyOptimisticAction(
      board(running, target),
      { type: "start", id: 3, at: atJst("12:30"), resumeSeq: 7 },
      today("12:30")
    );

    expect(ids(applied)).toEqual([[], [1, 4], [3, -7, 2]]);
    expect(find(applied, 4)?.endedAt).toEqual(atJst("12:30"));
    expect(find(applied, -7)).toMatchObject({ name: "読書（再開）", sectionId: 2 });
  });

  it("前日以前の実行中タスクを割り込んだときも、再開タスクの仮の行は表示日に出る（O-2）", () => {
    const stale = task({ id: 9, taskDate: "2026-07-01", startedAt: atJst("22:00"), name: "前日" });
    const target = task({ id: 3, sectionId: 1 });
    const applied = applyOptimisticAction(
      board(target),
      { type: "start", id: 3, at: atJst("12:30"), resumeSeq: 7 },
      { ...today("12:30"), staleRunningTask: stale }
    );

    expect(ids(applied)).toEqual([[], [1], [3, -7, 2]]);
    expect(find(applied, -7)).toMatchObject({ name: "前日（再開）", taskDate: TEST_DATE });
  });

  it("suspend は終了と、再開タスクの仮の行（直後）を出す（O-4）", () => {
    const running = task({ id: 4, sectionId: 1, startedAt: atJst("11:00"), name: "読書" });
    const applied = applyOptimisticAction(
      board(running),
      { type: "suspend", id: 4, at: atJst("11:30"), resumeSeq: 7 },
      today("11:30")
    );

    expect(find(applied, 4)?.endedAt).toEqual(atJst("11:30"));
    expect(ids(applied)).toEqual([[], [1, 4, -7], [2]]);
  });

  it("duplicate は複製の仮の行を出し、規則b の繰り下げ後の位置に置く（O-11）", () => {
    // 朝の未実行タスクを、現在（昼）に複製する: 直下に置かれた複製は規則b で現在位置の直後へ下がる。
    // 複製元自身も現在位置より前の未実行なので一緒に下がる（相対順序は保つ）
    const target = task({ id: 3, sectionId: 1, name: "片付け" });
    const applied = applyOptimisticAction(
      board(target),
      { type: "duplicate", id: 3, seq: 7 },
      today("12:30")
    );

    expect(ids(applied)).toEqual([[], [1], [3, -7, 2]]);
    expect(find(applied, -7)).toMatchObject({ name: "片付け", startedAt: null });
  });

  it("duplicateAndStart は開始済みの複製の仮の行を、規則a と同じ位置に出す（O-14）", () => {
    const applied = applyOptimisticAction(
      board(),
      { type: "duplicateAndStart", id: 1, at: atJst("12:30"), seq: 7, resumeSeq: 8 },
      today("12:30")
    );

    expect(ids(applied)).toEqual([[], [1], [-7, 2]]);
    expect(find(applied, -7)?.startedAt).toEqual(atJst("12:30"));
    expect(find(applied, -8)).toBeUndefined(); // 割り込み相手が無ければ再開タスクも無い
  });

  it("unstart は今日なら現在位置（現在時刻のセクションの未実行先頭）へ並べ直す（O-13）", () => {
    const running = task({ id: 4, sectionId: 1, startedAt: atJst("11:00") });
    const applied = applyOptimisticAction(
      board(running),
      { type: "unstart", id: 4, at: atJst("12:30") },
      today("12:30")
    );

    expect(find(applied, 4)?.startedAt).toBeNull();
    expect(ids(applied)).toEqual([[], [1], [4, 2]]);
  });

  it("uncomplete も今日なら現在位置へ並べ直す（O-15）", () => {
    const applied = applyOptimisticAction(
      board(),
      { type: "uncomplete", id: 1, at: atJst("12:30") },
      today("12:30")
    );

    expect(ids(applied)).toEqual([[], [], [1, 2]]);
  });

  it("配置を伴わない操作でも、規則b が動かす行があれば繰り下げた並びを出す（§4 冒頭「規則 b も先に当てる」）", () => {
    // 終了で実行中が居なくなると、現在位置は現在時刻のセクション（昼）へ移り、朝の未実行が下がる
    const running = task({ id: 4, sectionId: 1, startedAt: atJst("11:00") });
    const leftover = task({ id: 5, sectionId: 1 });
    const applied = applyOptimisticAction(
      board(running, leftover),
      { type: "finish", id: 4, at: atJst("12:30") },
      today("12:30")
    );

    expect(ids(applied)).toEqual([[], [1, 4], [5, 2]]);
  });

  it("duplicateAndStart の割り込みでは、相手の終了と再開タスクの仮の行（複製の直下）も出す（O-14）", () => {
    const running = task({ id: 4, sectionId: 2, startedAt: atJst("12:10"), name: "読書" });
    const applied = applyOptimisticAction(
      [unclassifiedGroup([]), sectionGroup(MORNING, "12:00", [done]), sectionGroup(NOON, "06:00", [running, later])],
      { type: "duplicateAndStart", id: 1, at: atJst("12:30"), seq: 7, resumeSeq: 8 },
      today("12:30")
    );

    expect(find(applied, 4)?.endedAt).toEqual(atJst("12:30"));
    expect(ids(applied)).toEqual([[], [1], [4, -7, -8, 2]]);
    expect(find(applied, -8)).toMatchObject({ name: "読書（再開）", splitParentId: 4, startedAt: null });
  });

  it("uncomplete は他に実行中タスクがあれば、その直後へ並べ直す（O-15。規則b では動かない形）", () => {
    // 現在位置＝実行中タスクの直後（朝）。取り消した行は現在位置より前に無いので、規則b はこの行を動かさない
    const running = task({ id: 4, sectionId: 1, startedAt: atJst("11:00") });
    const completed = task({
      id: 5,
      sectionId: 2,
      startedAt: atJst("12:05"),
      endedAt: atJst("12:10"),
      sortOrder: 500,
    });
    const applied = applyOptimisticAction(
      [unclassifiedGroup([]), sectionGroup(MORNING, "12:00", [done, running]), sectionGroup(NOON, "06:00", [completed, later])],
      { type: "uncomplete", id: 5, at: atJst("12:30") },
      today("12:30")
    );

    expect(ids(applied)).toEqual([[], [1, 4, 5], [2]]);
  });

  it("配置を伴う操作でも、今日でなければ規則b を当てない（§4.2 の対象日）", () => {
    const leftover = task({ id: 3, sectionId: 1, name: "片付け" });
    const applied = applyOptimisticAction(
      board(leftover),
      { type: "duplicate", id: 3, seq: 7 },
      { ...NOT_TODAY_TWO_SECTIONS, nowClock: "12:30" }
    );

    expect(ids(applied)).toEqual([[], [1, 3, -7], [2]]);
  });

  it("直下に中間値が無ければ振り直した値で並べ、表示の位置は直下のまま（データモデル定義書 §3.5）", () => {
    const target = task({ id: 3, sectionId: 1, sortOrder: 1000 });
    const next = task({ id: 4, sectionId: 1, sortOrder: 1001 });
    const applied = applyOptimisticAction(
      [unclassifiedGroup([]), sectionGroup(MORNING, "12:00", [target, next])],
      { type: "duplicate", id: 3, seq: 7 },
      NOT_TODAY_TWO_SECTIONS
    );

    expect(ids(applied)[1]).toEqual([3, -7, 4]);
  });

  it("先に当てた並び替え（採番しない）が混ざっても、表示順のまま計画を立てる", () => {
    // move は sort_order を振らないので、朝セクションの値の大小が表示順と食い違う
    const a = task({ id: 3, sectionId: 1, sortOrder: 3000 });
    const b = task({ id: 4, sectionId: 1, sortOrder: 4000 });
    const moved = applyOptimisticAction(
      board(a, b),
      { type: "move", id: 4, destination: { sectionId: 1, index: 1 } },
      NOT_TODAY_TWO_SECTIONS
    );
    expect(ids(moved)).toEqual([[], [1, 4, 3], [2]]);

    // 表示上 4 の直下へ複製する（値の大小で数えると 3 の下に入ってしまう）
    const duplicated = applyOptimisticAction(
      moved,
      { type: "duplicate", id: 4, seq: 7 },
      NOT_TODAY_TWO_SECTIONS
    );
    expect(ids(duplicated)).toEqual([[], [1, 4, -7, 3], [2]]);
  });

});

describe("仮の行の中身（画面定義書01 §4 冒頭「仮の行」/ データモデル定義書 §4.2・§4.6）", () => {
  // 全項目を固定する。写し漏れは仮の行と確定後の行の差になって、確定した瞬間に表示が変わる
  const original = task({
    id: 3,
    name: "読書",
    sectionId: 1,
    sortOrder: 1000,
    estimateMinutes: 60,
    modeId: 2,
    projectId: 4,
    bundleId: 5,
    url: "https://example.com/a",
    highlighted: true,
    comment: "メモ",
    routineId: 6,
    startedAt: atJst("09:00"),
  });
  const board = () => [unclassifiedGroup([]), sectionGroup(MORNING, "12:00", [original])];

  it("再開タスク（中断 O-4）は残り見積もりで、ハイライト・バンドル・URL も引き継ぐ", () => {
    const applied = applyOptimisticAction(
      board(),
      { type: "suspend", id: 3, at: atJst("09:20"), resumeSeq: 7 },
      NOT_TODAY
    );

    expect(find(applied, -7)).toEqual({
      id: -7,
      taskDate: TEST_DATE,
      initialTaskDate: TEST_DATE,
      name: "読書（再開）",
      estimateMinutes: 40,
      sectionId: 1,
      modeId: 2,
      projectId: 4,
      bundleId: 5,
      sortOrder: 2000,
      startedAt: null,
      endedAt: null,
      comment: null,
      url: "https://example.com/a",
      highlighted: true,
      routineId: null,
      splitParentId: 3,
      postponedCount: 0,
    });
  });

  it("複製（O-11）は見積もりを満額で写し、ハイライト・バンドル・系譜は引き継がない", () => {
    const applied = applyOptimisticAction(board(), { type: "duplicate", id: 3, seq: 7 }, NOT_TODAY);

    expect(find(applied, -7)).toEqual({
      id: -7,
      taskDate: TEST_DATE,
      initialTaskDate: TEST_DATE,
      name: "読書",
      estimateMinutes: 60,
      sectionId: 1,
      modeId: 2,
      projectId: 4,
      bundleId: null,
      sortOrder: 2000,
      startedAt: null,
      endedAt: null,
      comment: null,
      url: "https://example.com/a",
      highlighted: false,
      routineId: null,
      splitParentId: null,
      postponedCount: 0,
    });
  });
});

describe("isProvisional（画面定義書01 §4 冒頭「仮の行」）", () => {
  it("負の id の行だけを仮の行とみなす", () => {
    expect(isProvisional({ id: -1 })).toBe(true);
    expect(isProvisional({ id: 1 })).toBe(false);
  });
});

describe("optimisticTask（サーバ確定前の仮タスク）", () => {
  it("負のIDで未確定と分かるようにし、未分類の末尾（画面定義書01 §3.4）へ置く形で作る", () => {
    // 全項目を固定する。既定値の入れ忘れは仮の行と確定後の行の差になって表に出るため
    expect(optimisticTask(TEST_DATE, "買い物", 7)).toEqual({
      id: -7,
      taskDate: TEST_DATE,
      initialTaskDate: TEST_DATE, // 生まれた日そのもの＝持ち越し表示は出ない（F-122）
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
      url: null,
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
