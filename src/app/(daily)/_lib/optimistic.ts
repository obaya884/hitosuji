// 楽観的更新の状態遷移。表示日1日分のグループを受けて次のグループを返すだけなので、
// コンポーネントから切り出して純関数にする（テスト戦略定義書 §3）。
import {
  groupTasksBySection,
  withTaskAppended,
  withTaskMoved,
  withTaskRemoved,
  withTaskUpdated,
  type DailyGroup,
} from "@/domain/task/daily-list";
import type { ModeId } from "@/domain/mode/mode";
import type { ProjectId } from "@/domain/project/project";
import type { Section, SectionId } from "@/domain/section/section";
import type { LogicalDate } from "@/domain/shared/logical-date";
import {
  planDuplicate,
  planDuplicateAndStart,
  planPunchEdit,
  planStart,
  planSuspend,
  planUndoPunch,
  type InterruptionPlan,
  type NewRowPlan,
} from "@/domain/task/placement";
import { planCarryOver, withRelocations, type Relocation } from "@/domain/task/relocation";
import type { Renumber } from "@/domain/task/sort-order";
import { taskStatus } from "@/domain/task/status";
import type { Task, TaskId } from "@/domain/task/task";
import { formatClock } from "@/app/_lib/format";

/**
 * 楽観的更新（N-01 / 00_共通 §4）: 永続化を待たずに画面へ反映し、失敗時はサーバ状態へ巻き戻す。
 * **どこまでを確定前に出すかは画面定義書01 §4 冒頭「確定前に出す範囲」の表が正**。
 * 配置（行がどこへ入るか）はサーバと同じ domain の計画（`domain/task/placement.ts`）を当てるので、
 * 確定前の表示は確定結果と一致する（同表の「線引きの基準」）。
 *
 * 仮の行の `seq` は `provisionalTask` の契約に従う。`at` はサーバへ送るのと同じ時刻を載せる——
 * reducer は積み直しのたびに再実行されるので、時刻も仮 id も action の中に持たせて純粋に保つ
 */
export type OptimisticAction =
  | Readonly<{ type: "append"; task: Task }>
  | Readonly<{ type: "rename"; id: TaskId; name: string }>
  | Readonly<{ type: "estimate"; id: TaskId; minutes: number }>
  | Readonly<{ type: "comment"; id: TaskId; comment: string | null }>
  | Readonly<{ type: "url"; id: TaskId; url: string | null }>
  | Readonly<{ type: "highlight"; id: TaskId; highlighted: boolean }>
  | Readonly<{ type: "start"; id: TaskId; at: Date; resumeSeq: number }>
  | Readonly<{ type: "suspend"; id: TaskId; at: Date; resumeSeq: number }>
  | Readonly<{ type: "duplicate"; id: TaskId; seq: number }>
  | Readonly<{ type: "duplicateAndStart"; id: TaskId; at: Date; seq: number; resumeSeq: number }>
  | Readonly<{ type: "unstart"; id: TaskId; at: Date }>
  | Readonly<{ type: "uncomplete"; id: TaskId; at: Date }>
  | Readonly<{ type: "finish"; id: TaskId; at: Date }>
  | Readonly<{ type: "punch"; id: TaskId; startedAt: Date; endedAt: Date | null }>
  | Readonly<{
      type: "move";
      id: TaskId;
      destination: Readonly<{ sectionId: SectionId | null; index: number }>;
    }>
  | Readonly<{ type: "mode"; id: TaskId; modeId: ModeId | null }>
  | Readonly<{ type: "project"; id: TaskId; projectId: ProjectId | null }>
  | Readonly<{ type: "remove"; id: TaskId }>;

/** 計画を当てるのに要る、表示日の外の情報（盤面が持つ） */
export type OptimisticContext = Readonly<{
  /** アーカイブ済みも含むセクション（`groupTasksBySection` で組み直すため。サーバの一覧と同じもの） */
  sections: readonly Section[];
  /** 表示日が今日か。規則a / b と取り消しの並べ直しは今日だけ（画面定義書01 §4.2） */
  isToday: boolean;
  /** 規則b の「現在位置」に使う現在時刻の `HH:MM` */
  nowClock: string;
  /** 前日以前に放置されている実行中タスク。表示日に居ない割り込み相手になりうる（O-2） */
  staleRunningTask: Task | null;
}>;

export function applyOptimisticAction(
  groups: readonly DailyGroup[],
  action: OptimisticAction,
  context: OptimisticContext
): DailyGroup[] {
  const placed = applyPlacement(normalizedTasks(groups), action, context);
  if (placed !== null) return withCarryOver(placed, context);

  // 配置を伴わない操作は表示上の並びをそのまま変える。そのあとで規則b が動かす行があるときだけ組み直す
  const changed = applyInPlace(groups, action);
  if (!context.isToday) return changed;
  const tasks = normalizedTasks(changed);
  const carryOver = planCarryOver(tasks, context.sections, context.nowClock);
  return carryOver.length === 0 ? changed : regroup(withRelocations(tasks, carryOver), context);
}

/**
 * 画面定義書01 §4 冒頭「規則 b も先に当てる」: サーバは操作のたびにデイリーを描き直し、そのとき
 * 規則b を当てる（画面定義書01 §4.2 の発火タイミング）ので、確定前の並びにも同じ繰り下げを当ててから組み直す
 */
function withCarryOver(tasks: readonly Task[], context: OptimisticContext): DailyGroup[] {
  const carryOver = context.isToday
    ? planCarryOver(tasks, context.sections, context.nowClock)
    : [];
  return regroup(withRelocations(tasks, carryOver), context);
}

function regroup(tasks: readonly Task[], context: OptimisticContext): DailyGroup[] {
  return groupTasksBySection(tasks, context.sections);
}

/**
 * 計画（domain の placement）を当てる操作。配置を伴わない操作なら null。
 * 計画は**変更前**のタスク列から立てる（開始前の行・修正前の開始時刻を見る規則があるため）
 */
function applyPlacement(
  tasks: readonly Task[],
  action: OptimisticAction,
  context: OptimisticContext
): Task[] | null {
  switch (action.type) {
    // 開始（O-2）: 規則a の移動と、割り込みなら相手の終了・再開タスクの仮の行（移動後の直下）
    case "start": {
      const target = findTask(tasks, action.id);
      if (target === undefined) return [...tasks];
      const plan = planStart({
        target,
        sameDay: tasks,
        sections: context.sections,
        running: runningOtherThan(tasks, target.id, context),
        now: action.at,
        nowClock: formatClock(action.at),
        isToday: context.isToday,
      });
      const started = updated(withRelocations(tasks, plan.relocations), target.id, {
        startedAt: action.at,
      });
      return withInterruption(started, plan.interruption, plan.renumber, target.taskDate, action.resumeSeq);
    }
    // 中断（O-4）: 終了と、再開タスクの仮の行（直後）
    case "suspend": {
      const target = findTask(tasks, action.id);
      if (target === undefined) return [...tasks];
      const plan = planSuspend(target, tasks, action.at);
      const ended = updated(withRenumber(tasks, plan.renumber), target.id, { endedAt: action.at });
      return [...ended, provisionalTask(action.resumeSeq, target.taskDate, plan.resume)];
    }
    // 複製（O-11）: 複製の仮の行（直下。今日なら規則b の繰り下げが後から当たる）
    case "duplicate": {
      const target = findTask(tasks, action.id);
      if (target === undefined) return [...tasks];
      const plan = planDuplicate(target, tasks);
      return [
        ...withRenumber(tasks, plan.renumber),
        provisionalTask(action.seq, target.taskDate, plan.duplicate),
      ];
    }
    // 複製して開始（O-14）: 開始済みの複製の仮の行と、割り込みなら相手の終了・再開タスクの仮の行
    case "duplicateAndStart": {
      const target = findTask(tasks, action.id);
      if (target === undefined) return [...tasks];
      const plan = planDuplicateAndStart({
        target,
        sameDay: tasks,
        sections: context.sections,
        running: runningOtherThan(tasks, target.id, context),
        now: action.at,
        nowClock: formatClock(action.at),
        isToday: context.isToday,
      });
      const withDuplicate = [
        ...tasks,
        provisionalTask(action.seq, target.taskDate, plan.duplicate, action.at),
      ];
      return withInterruption(withDuplicate, plan.interruption, plan.renumber, target.taskDate, action.resumeSeq);
    }
    // 開始の取り消し（O-13）・完了の取り消し（O-15）: 打刻のクリアと、今日なら現在位置への並べ直し
    case "unstart":
    case "uncomplete": {
      const target = findTask(tasks, action.id);
      if (target === undefined) return [...tasks];
      const relocations = planUndoPunch(
        target,
        tasks,
        context.sections,
        formatClock(action.at),
        context.isToday
      );
      const cleared =
        action.type === "unstart" ? { startedAt: null } : { startedAt: null, endedAt: null };
      return updated(withRelocations(tasks, relocations), target.id, cleared);
    }
    // 打刻時刻の修正（F-203）: 値と、開始時刻が変わったときの規則c の移動
    case "punch": {
      const target = findTask(tasks, action.id);
      if (target === undefined) return [...tasks];
      const relocations: Relocation[] = planPunchEdit(
        target,
        tasks,
        context.sections,
        action.startedAt,
        formatClock(action.startedAt)
      );
      return updated(withRelocations(tasks, relocations), target.id, {
        startedAt: action.startedAt,
        endedAt: action.endedAt,
      });
    }
    default:
      return null;
  }
}

/** 配置を伴わない操作（値の差し替え・追加・並び替え・取り除き） */
function applyInPlace(groups: readonly DailyGroup[], action: OptimisticAction): DailyGroup[] {
  switch (action.type) {
    case "append":
      return withTaskAppended(groups, action.task);
    case "rename":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, name: action.name }));
    case "estimate":
      return withTaskUpdated(groups, action.id, (t) => ({
        ...t,
        estimateMinutes: action.minutes,
      }));
    // コメント（O-16）。null なら未設定へ戻る＝印も消える
    case "comment":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, comment: action.comment }));
    // URL（O-18）。null なら未設定へ戻る＝印も消える
    case "url":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, url: action.url }));
    // ハイライトは行の位置に影響しないので、印だけを差し替える（O-17 / F-118）
    case "highlight":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, highlighted: action.highlighted }));
    // 終了（O-3）。完了タスクは並びが動かない（§4.2）。実行中が居なくなることで動く規則b は呼び出し側が当てる
    case "finish":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, endedAt: action.at }));
    case "move":
      return withTaskMoved(groups, action.id, action.destination);
    case "mode":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, modeId: action.modeId }));
    case "project":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, projectId: action.projectId }));
    // 削除（O-8）・日付移動（O-7）。どちらも行が表示日から外れる
    case "remove":
      return withTaskRemoved(groups, action.id);
    default:
      return [...groups];
  }
}

/**
 * 表示順のタスク列。計画は `sortOrder` の大小で位置を数えるので、表示上の並びと食い違う値を残さない——
 * 先に当てた楽観的な並び替え（`withTaskMoved` は採番しない）やクイック追加の仮の値が混ざった
 * セクションだけ、表示順のまま1000刻みで振り直す（他のセクションは値をそのまま保つ）
 */
function normalizedTasks(groups: readonly DailyGroup[]): Task[] {
  return groups.flatMap((g) => {
    const ascending = g.tasks.every((t, i) => i === 0 || g.tasks[i - 1].sortOrder < t.sortOrder);
    return ascending ? [...g.tasks] : g.tasks.map((t, i) => ({ ...t, sortOrder: (i + 1) * 1000 }));
  });
}

/** 割り込みの反映: 相手の終了（表示日に居れば）と再開タスクの仮の行 */
function withInterruption(
  tasks: readonly Task[],
  interruption: InterruptionPlan | null,
  renumber: Renumber,
  taskDate: LogicalDate,
  resumeSeq: number
): Task[] {
  const renumbered = withRenumber(tasks, renumber);
  if (interruption === null) return renumbered;
  // 終了時刻は開始と同じ値（O-2）。前日以前の相手は表示日に居ないので終了は現れない
  const ended = updated(renumbered, interruption.runningTaskId, { endedAt: interruption.endedAt });
  return [...ended, provisionalTask(resumeSeq, taskDate, interruption.resume)];
}

/** 割り込み相手（実行中は全体で最大1件。表示日に居なければ前日以前の放置分） */
function runningOtherThan(
  tasks: readonly Task[],
  targetId: TaskId,
  context: OptimisticContext
): Task | null {
  return (
    tasks.find((t) => t.id !== targetId && taskStatus(t) === "running") ??
    context.staleRunningTask
  );
}

function findTask(tasks: readonly Task[], id: TaskId): Task | undefined {
  return tasks.find((t) => t.id === id);
}

function updated(tasks: readonly Task[], id: TaskId, patch: Partial<Task>): Task[] {
  return tasks.map((t) => (t.id === id ? { ...t, ...patch } : t));
}

/** 中間値が尽きたときの振り直し（データモデル定義書 §3.5）を表示用のタスク列へ当てる */
function withRenumber(tasks: readonly Task[], renumber: Renumber): Task[] {
  if (renumber.length === 0) return [...tasks];
  const sortOrderOf = new Map(renumber.map((r) => [r.taskId, r.sortOrder]));
  return tasks.map((t) => {
    const sortOrder = sortOrderOf.get(t.id);
    return sortOrder === undefined ? t : { ...t, sortOrder };
  });
}

type ProvisionalDraft = Readonly<{
  name: string;
  estimateMinutes: number;
  modeId: ModeId | null;
  projectId: ProjectId | null;
  url: string | null;
  highlighted?: boolean;
  splitParentId?: TaskId | null;
  bundleId?: Task["bundleId"];
}>;

/**
 * 楽観的更新で先に表示する仮の行（画面定義書01 §4 冒頭「仮の行」）。IDは符号を反転して負にする——
 * サーバの採番は必ず正なので、こうしておけば確定済みの行とぶつからない（`isProvisional`）。
 * 内容と置き場は domain の計画（`NewRowPlan`）をそのまま写す。持たない項目は新しい行の既定値。
 *
 * `seq` は**そのボードが生きている間ずっと重複しない正の整数**（0 は `-0` になって負にならない）。
 * 呼び出し側が単調増加カウンタで採ること——重複すると片方への更新・削除が他方を巻き添えにする
 */
export function provisionalTask(
  seq: number,
  taskDate: LogicalDate,
  plan: NewRowPlan<ProvisionalDraft>,
  startedAt: Date | null = null
): Task {
  return {
    id: -seq,
    taskDate,
    initialTaskDate: taskDate, // 生まれた日そのもの。持ち越し表示は出ない（F-122）
    name: plan.draft.name,
    estimateMinutes: plan.draft.estimateMinutes,
    sectionId: plan.sectionId,
    modeId: plan.draft.modeId,
    projectId: plan.draft.projectId,
    bundleId: plan.draft.bundleId ?? null,
    sortOrder: plan.sortOrder,
    startedAt,
    endedAt: null,
    comment: null,
    url: plan.draft.url,
    highlighted: plan.draft.highlighted ?? false,
    routineId: null,
    splitParentId: plan.draft.splitParentId ?? null,
    postponedCount: 0,
  };
}

/** クイック追加（O-1）の仮の行。未分類の末尾（§3.4）に、名前だけを持って出す */
export function optimisticTask(date: LogicalDate, name: string, seq: number): Task {
  return provisionalTask(seq, date, {
    draft: { name, estimateMinutes: 0, modeId: null, projectId: null, url: null },
    sectionId: null,
    sortOrder: Number.MAX_SAFE_INTEGER, // 未分類の末尾（§3.4）
  });
}

/** 確定前の仮の行か（画面定義書01 §4 冒頭「仮の行」: 選択はできるが操作は効かない） */
export function isProvisional(task: Readonly<{ id: TaskId }>): boolean {
  return task.id < 0;
}
