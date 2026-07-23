"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import { dayStartTimeOf, startMinutes, type Section } from "@/domain/section/section";
import { weekdayIndex, type LogicalDate } from "@/domain/shared/logical-date";
import {
  withTaskAppended,
  withTaskMoved,
  withTaskUpdated,
  type DailyGroup,
} from "@/domain/task/daily-list";
import { stepMoveDestination } from "@/domain/task/reorder";
import { keepSelection } from "@/domain/task/selection";
import { taskStatus } from "@/domain/task/status";
import { editEndedAt, editStartedAt } from "@/domain/task/punch-edit";
import { validateEstimateMinutes, validateTaskName } from "@/domain/task/edit";
import type { RoutineFromTaskChoice } from "@/domain/routine/from-task";
import type { Task } from "@/domain/task/task";
import { PlusIcon } from "@/app/_components/icons";
import { formatClock } from "@/app/_lib/format";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { inputBase } from "@/app/_lib/ui";
import { useNow } from "@/app/_lib/use-now";
import {
  addTaskAction,
  createRoutineFromTaskAction,
  deleteTaskAction,
  duplicateAndStartTaskAction,
  duplicateTaskAction,
  finishTaskAction,
  moveTaskByStepAction,
  postponeTaskAction,
  renameTaskAction,
  restoreTaskAction,
  suspendTaskAction,
  setTaskModeAction,
  setTaskProjectAction,
  setTaskSectionAction,
  startTaskAction,
  undoStartAction,
  updateTaskEstimateAction,
  updateTaskPunchAction,
  type CreatingActionResult,
  type DailyActionResult,
} from "../actions";
import { DailyList, type EditingCell } from "./daily-list";
import { DailySummary } from "./daily-summary";
import { DateNav } from "@/app/_components/date-nav";
import { ShortcutHelp } from "./shortcut-help";
import { StaleRunningBanner } from "./stale-running-banner";
import { Toast } from "./toast";
import { useDailyShortcuts } from "./use-daily-shortcuts";

type Props = Readonly<{
  date: LogicalDate;
  isToday: boolean;
  groups: readonly DailyGroup[];
  modes: readonly Mode[];
  projects: readonly Project[];
  sections: readonly Section[];
  /** 前日以前に放置されている実行中タスク（画面定義書01 §8） */
  staleRunningTask: Task | null;
}>;

// 楽観的更新（N-01）: 永続化を待たずに画面へ反映し、失敗時はサーバ状態へ巻き戻す
type OptimisticAction =
  | Readonly<{ type: "append"; task: Task }>
  | Readonly<{ type: "rename"; id: number; name: string }>
  | Readonly<{ type: "estimate"; id: number; minutes: number }>
  | Readonly<{ type: "start"; id: number; at: Date }>
  | Readonly<{ type: "unstart"; id: number }>
  | Readonly<{ type: "finish"; id: number; at: Date }>
  | Readonly<{ type: "punch"; id: number; startedAt: Date; endedAt: Date | null }>
  | Readonly<{
      type: "move";
      id: number;
      destination: Readonly<{ sectionId: number | null; index: number }>;
    }>
  | Readonly<{ type: "mode"; id: number; modeId: number | null }>
  | Readonly<{ type: "project"; id: number; projectId: number | null }>
  | Readonly<{ type: "remove"; id: number }>;

function applyOptimisticAction(
  groups: readonly DailyGroup[],
  action: OptimisticAction
): DailyGroup[] {
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
    // 割り込み時の「実行中タスクの終了・再開タスク生成」はサーバ確定後に反映される
    case "start":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, startedAt: action.at }));
    // 未実行への並べ直し（§4.5）はサーバ確定後に反映される。まず打刻だけ消す
    case "unstart":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, startedAt: null }));
    case "finish":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, endedAt: action.at }));
    case "punch":
      return withTaskUpdated(groups, action.id, (t) => ({
        ...t,
        startedAt: action.startedAt,
        endedAt: action.endedAt,
      }));
    case "move":
      return withTaskMoved(groups, action.id, action.destination);
    case "mode":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, modeId: action.modeId }));
    case "project":
      return withTaskUpdated(groups, action.id, (t) => ({ ...t, projectId: action.projectId }));
    case "remove":
      return groups.map((g) => ({ ...g, tasks: g.tasks.filter((t) => t.id !== action.id) }));
  }
}

const PUNCH_EDIT_MESSAGES: Record<string, string> = {
  invalid_time: "時刻は HH:MM 形式で入力してください",
  not_punched: "打刻されていないため修正できません",
  no_started_at: "開始時刻のないタスクに終了時刻は設定できません",
  ended_before_started: "終了時刻は開始時刻より後にしてください",
};

/** 楽観的更新で先に表示する仮タスク。負のIDでサーバ確定前だと分かるようにする */
function optimisticTask(date: LogicalDate, name: string): Task {
  return {
    id: -Date.now(),
    taskDate: date,
    name,
    estimateMinutes: 0,
    sectionId: null,
    modeId: null,
    projectId: null,
    sortOrder: Number.MAX_SAFE_INTEGER, // 未分類の末尾（§3.4）
    startedAt: null,
    endedAt: null,
    comment: null,
    routineId: null,
    splitParentId: null,
    postponedCount: 0,
  };
}

export function DailyBoard({
  date,
  isToday,
  groups,
  modes,
  projects,
  sections,
  staleRunningTask,
}: Props) {
  const [optimisticGroups, dispatchOptimistic] = useOptimistic(groups, applyOptimisticAction);
  const [name, setName] = useState("");
  const [rawSelectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<EditingCell | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const quickAddRef = useRef<HTMLInputElement>(null);
  // 固定領域の高さ。選択行のスクロール追従（§5）が固定領域の裏で止まらないようにするため実測する
  const stickyRef = useRef<HTMLDivElement>(null);
  const [stickyHeight, setStickyHeight] = useState(0);
  const router = useRouter();
  // 直前に削除したタスク（Undo 用。O-8）
  const [deleted, setDeleted] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 完了通知（ルーチン化 O-12 など。画面定義書01 §8） */
  const [notice, setNotice] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // 実行中タスクの経過（F-205）と終了予定時刻（F-104）のため毎分更新する。
  // 当日を表示していないときは終了予定を出さないので、実行中タスクがある場合のみ回す
  const hasRunning = optimisticGroups.some((g) =>
    g.tasks.some((t) => taskStatus(t) === "running")
  );
  const now = useNow(hasRunning || isToday);

  // 日界（分）。終了予定・セクション残りの起点を論理日の区切りに合わせる（F-116）
  const dayStartMinutes = useMemo(() => startMinutes(dayStartTimeOf(sections)), [sections]);

  // 固定領域の高さを実測する（内容で変わりうるので ResizeObserver で追う）
  useEffect(() => {
    const sticky = stickyRef.current;
    if (sticky === null) return;

    const observer = new ResizeObserver(() => setStickyHeight(sticky.offsetHeight));
    observer.observe(sticky);
    return () => observer.disconnect();
  }, []);

  // 表示順に並んだタスク（選択行モデルの基盤。画面定義書01 §5）
  const orderedTasks = useMemo(
    () => optimisticGroups.flatMap((g) => g.tasks),
    [optimisticGroups]
  );

  // 選択行は描画時に導出する（§5）。未選択や、削除・日付移動で選択が消えた場合は
  // 「現在地」（実行中、なければ最初の未実行）へ自動的に戻る
  const selectedId = keepSelection(orderedTasks, rawSelectedId);

  // 引数順は runSelectingCreated と揃えて action を先頭にする（読み違い防止）
  function run(action: () => Promise<DailyActionResult>, optimistic: OptimisticAction) {
    setError(null);
    startTransition(async () => {
      dispatchOptimistic(optimistic);
      const result = await action();
      if (!result.ok) setError(result.message);
    });
  }

  /**
   * 生成系（複製・複製して開始・クイック追加）の共通処理。採番をサーバが決めるため
   * 生成物の選択は確定後に寄せる（O-11）: 成功なら `createdId` へ選択を移し、失敗なら `setError`。
   * `optimistic` を渡すと確定前に楽観更新を反映する（クイック追加の即時表示用）
   */
  function runSelectingCreated(
    action: () => Promise<CreatingActionResult>,
    optimistic?: OptimisticAction
  ) {
    setError(null);
    startTransition(async () => {
      if (optimistic !== undefined) dispatchOptimistic(optimistic);
      const result = await action();
      if (result.ok) setSelectedId(result.createdId);
      else setError(result.message);
    });
  }

  // §3.4: Enter で追加 → 欄はクリアし、追加したタスクを選択（FB-29）。連続入力は N で欄に戻る。
  // 空のままの Enter は何もしない。欄からのフォーカス外しは呼び出し側で行う（ref をレンダー中に読まない）
  function add() {
    const trimmed = name.trim();
    if (trimmed === "") return;

    setName("");
    // 追加行は楽観的に即表示し、確定後に追加したタスクを選択する（§3.4 / FB-29）
    runSelectingCreated(() => addTaskAction({ date, name: trimmed }), {
      type: "append",
      task: optimisticTask(date, trimmed),
    });
  }

  function rename(task: Task, raw: string) {
    const validated = validateTaskName(raw);
    if (!validated.ok) return; // 空名は確定不可（§8）。編集は破棄して元の名前に戻る
    if (validated.value === task.name) return;

    run(
      () => renameTaskAction(task.id, validated.value),
      { type: "rename", id: task.id, name: validated.value }
    );
  }

  function setEstimate(task: Task, raw: string) {
    const validated = validateEstimateMinutes(raw);
    if (!validated.ok) {
      setError("見積もりは分（0以上の整数）で入力してください");
      return;
    }
    if (validated.value === task.estimateMinutes) return;

    run(
      () => updateTaskEstimateAction(task.id, raw),
      { type: "estimate", id: task.id, minutes: validated.value }
    );
  }

  /**
   * Enter の打刻（画面定義書01 §6）。未実行=開始 / 実行中=終了 のトグル、
   * 完了=複製して開始（F-208 / O-14）。打刻時刻はクライアントの現在時刻を送る（§7）
   */
  function punch(task: Task) {
    const status = taskStatus(task);
    const now = new Date();
    if (status === "completed") {
      duplicateAndStart(task, now); // F-208 / O-14
    } else if (status === "not_started") {
      run(() => startTaskAction(task.id, now), { type: "start", id: task.id, at: now });
    } else {
      run(() => finishTaskAction(task.id, now), { type: "finish", id: task.id, at: now });
    }
  }

  /**
   * 複製して開始（F-208 / O-14）。完了タスクの「もう一回」。生成物の採番はサーバが決めるため
   * 楽観的更新はせず（O-11 と同じ）、開始した複製タスクへ選択を移す
   */
  function duplicateAndStart(task: Task, now: Date) {
    runSelectingCreated(() => duplicateAndStartTaskAction(task.id, now));
  }

  /** 開始打刻の取り消し（O-13 / F-210）。実行中タスクを未実行へ戻す。now はクライアントのものを送る */
  function unstart(task: Task) {
    run(() => undoStartAction(task.id, new Date()), { type: "unstart", id: task.id });
  }

  /** 開始・終了時刻のインライン修正（F-203）。HH:MM の解釈は利用者のタイムゾーンで行う */
  function editPunch(task: Task, field: "startedAt" | "endedAt", hhmm: string) {
    const edited = field === "startedAt" ? editStartedAt(task, hhmm) : editEndedAt(task, hhmm);
    if (!edited.ok) {
      setError(PUNCH_EDIT_MESSAGES[edited.error]);
      return;
    }

    // editStartedAt / editEndedAt を通った時点で startedAt は必ず存在する
    if (task.startedAt === null) return;
    const punch =
      field === "startedAt"
        ? { startedAt: edited.value, endedAt: task.endedAt }
        : { startedAt: task.startedAt, endedAt: edited.value };

    // 移動先セクションの判定に使う HH:MM は、利用者のタイムゾーンで整形して送る（§4.2-c）。
    // 「今日」の判定に使う現在時刻も、他の打刻と同じくクライアントのものを送る
    run(
      () => updateTaskPunchAction(task.id, punch, formatClock(punch.startedAt), new Date()),
      { type: "punch", id: task.id, ...punch }
    );
  }

  /** モード・プロジェクト・セクションの割り当て（O-5） */
  function assign(task: Task, field: "mode" | "project" | "section", id: number | null) {
    if (field === "mode") {
      run(() => setTaskModeAction(task.id, id), { type: "mode", id: task.id, modeId: id });
      return;
    }
    if (field === "project") {
      run(() => setTaskProjectAction(task.id, id), {
        type: "project",
        id: task.id,
        projectId: id,
      });
      return;
    }
    // セクション移動は移動先末尾への並び替え。表示上の位置はクライアントで決まるので楽観更新する
    const destination = optimisticGroups.find((g) => (g.section?.id ?? null) === id);
    run(() => setTaskSectionAction({ taskId: task.id, date, sectionId: id }), {
      type: "move",
      id: task.id,
      destination: { sectionId: id, index: destination?.tasks.length ?? 0 },
    });
  }

  /** 中断・複製・先送り・削除（F-204 / F-111 / F-107 / O-8） */
  function operate(task: Task, operation: "suspend" | "duplicate" | "postpone" | "delete") {
    if (operation === "delete") {
      run(
        async () => {
          const result = await deleteTaskAction(task.id);
          if (result.ok) setDeleted(result.deleted);
          return result;
        },
        { type: "remove", id: task.id }
      );
      return;
    }

    if (operation === "duplicate") {
      // 複製したタスクを選択する（O-11）。採番はサーバが決めるため楽観更新はしない
      runSelectingCreated(() => duplicateTaskAction(task.id));
      return;
    }

    // 中断・先送りは楽観更新せずサーバ確定を待つ
    setError(null);
    startTransition(async () => {
      const result =
        operation === "suspend"
          ? await suspendTaskAction(task.id, new Date())
          : await postponeTaskAction(task.id);
      if (!result.ok) setError(result.message);
    });
  }

  /**
   * ルーチン化（O-12 / §4.1）。デイリーの表示は変わらないので楽観的更新はせず、
   * サーバ確定を待って完了トーストを出す
   */
  function routinize(task: Task, choice: RoutineFromTaskChoice) {
    setError(null);
    startTransition(async () => {
      const result = await createRoutineFromTaskAction(task.id, choice);
      if (result.ok) setNotice(`「${task.name}」をルーチン化しました（明日から展開）`);
      else setError(result.message);
    });
  }

  /** 削除の取り消し（O-8） */
  function undoDelete() {
    if (deleted === null) return;
    const restoring = deleted;
    setDeleted(null);
    setError(null);
    startTransition(async () => {
      const result = await restoreTaskAction(restoring);
      if (!result.ok) setError(result.message);
    });
  }

  /**
   * Shift+J/K での並び替え（画面定義書01 §6）。N-01 が0ms目標に挙げる操作なので楽観更新する。
   * 移動先はサーバ確定（moveTaskByStep）と同じ純関数 stepMoveDestination で求める（規則の二重実装を排除）
   */
  function moveByStep(step: 1 | -1) {
    if (selectedId === null) return;

    const sectionOrder = optimisticGroups.map((g) => g.section?.id ?? null);
    const destination = stepMoveDestination(orderedTasks, selectedId, step, sectionOrder);
    if (destination === null) return; // 移動先なし（リスト全体の端など）

    run(() => moveTaskByStepAction({ taskId: selectedId, date, step }), {
      type: "move",
      id: selectedId,
      destination,
    });
  }

  const onKeyDown = inlineEditKeyHandler({
    // 追加できたときだけ欄からフォーカスを外し、追加行の操作へ移る（§3.4 / FB-29）
    onEnter: (input) => {
      if (name.trim() !== "") input.blur();
      add();
    },
    onEscape: (input) => input.blur(), // Esc でフォーカスを外しリスト操作へ戻る
  });

  // Undo トーストの自動消去（O-8）は Toast コンポーネント側に一元化してある（画面定義書01 §8 / FB-15）

  // グローバルキーボードショートカット（§6）。配線はフックへ切り出し（挙動は不変・T-14）
  useDailyShortcuts({
    editing,
    orderedTasks,
    selectedId,
    deleted,
    date,
    quickAddRef,
    router,
    setEditing,
    setShowHelp,
    setSelectedId,
    moveByStep,
    punch,
    operate,
    unstart,
    undoDelete,
  });

  return (
    <>
      {/*
        画面上部（h1・日付ナビ＋サマリ・クイック追加欄）は画面上端に固定する（§2 / FB-22）。
        本文の余白（main の py-6）の中で固定すると隙間からリストが覗くので、
        負のマージンで余白ぶんまで背景を広げてから内側で戻す
      */}
      <div
        ref={stickyRef}
        // 下端の罫線でリストとの階層を示す（§2。罫線がないとスクロール中に境界が分からない）
        className="sticky top-0 z-10 -mx-6 -mt-6 border-b border-line-strong bg-paper px-6 pt-6 pb-3"
      >
        {/* 画面見出し（画面定義書01 §2。S-02/S-03 と揃える） */}
        <h1 className="mb-3 text-lg font-bold">デイリー</h1>

        {/* 日付ナビ＋サマリ（画面定義書01 §2）。
            サマリは日付の直後へ左寄せで続ける（§3.1 / FB-22）。? だけ右端に置く */}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <DateNav date={date} weekday={weekdayIndex(date)} isToday={isToday} basePath="/" />
          <DailySummary
            groups={optimisticGroups}
            now={now}
            isToday={isToday}
            dayStartMinutes={dayStartMinutes}
          />
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            aria-label="キーボードショートカット"
            className="ml-auto text-xs text-ink-faint hover:text-ink"
          >
            ?
          </button>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <PlusIcon className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
          <input
            ref={quickAddRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder="タスク名を入力して Enter で追加"
            className={`w-full text-sm ${inputBase}`}
          />
        </div>
      </div>

      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}

      {/* トースト置き場（画面定義書01 §8）。Undo とエラーが同時に出ても重ならないよう1箇所にまとめる */}
      {(deleted !== null || notice !== null || error !== null) && (
        <div className="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 flex-col items-center gap-2">
          {/* 削除の Undo トースト（O-8）。key で削除のたびに再マウントし、表示時間を毎回リセットする */}
          {deleted !== null && (
            <Toast
              key={deleted.id}
              message={`「${deleted.name}」を削除しました`}
              variant="undo"
              actionLabel="取り消す"
              onAction={undoDelete}
              onClose={() => setDeleted(null)}
            />
          )}
          {/* 操作完了の通知（ルーチン化など） */}
          {notice !== null && (
            <Toast key={notice} message={notice} variant="info" onClose={() => setNotice(null)} />
          )}
          {/* 永続化失敗のエラートースト。key はメッセージ文字列でよい
              （同一メッセージの連続発生でタイマーが延長されなくても実害はないため） */}
          {error !== null && (
            <Toast key={error} message={error} variant="error" onClose={() => setError(null)} />
          )}
        </div>
      )}

      {staleRunningTask !== null && <StaleRunningBanner task={staleRunningTask} />}

      <DailyList
        groups={optimisticGroups}
        modes={modes}
        projects={projects}
        onRename={rename}
        onEstimate={setEstimate}
        onPunch={punch}
        onEditPunch={editPunch}
        sections={sections}
        onAssign={assign}
        onOperate={operate}
        onRoutinize={routinize}
        editing={editing}
        onBeginEdit={(task, field) => setEditing({ taskId: task.id, field })}
        onEndEdit={() => setEditing(null)}
        selectedId={selectedId}
        onSelect={setSelectedId}
        now={now}
        isToday={isToday}
        dayStartMinutes={dayStartMinutes}
        stickyHeight={stickyHeight}
      />
    </>
  );
}
