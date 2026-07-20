"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useOptimistic, useRef, useState, useTransition } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { Section } from "@/domain/section/section";
import { addDays, weekdayIndex, type LogicalDate } from "@/domain/shared/logical-date";
import {
  withTaskAppended,
  withTaskMoved,
  withTaskUpdated,
  type DailyGroup,
} from "@/domain/task/daily-list";
import { currentTaskId, keepSelection, moveSelection } from "@/domain/task/selection";
import { taskStatus } from "@/domain/task/status";
import { editEndedAt, editStartedAt } from "@/domain/task/punch-edit";
import { validateEstimateMinutes, validateTaskName } from "@/domain/task/task-edit";
import type { Task } from "@/domain/task/task";
import { PlusIcon } from "@/app/_components/icons";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { inputBase } from "@/app/_lib/ui";
import { useNow } from "@/app/_lib/use-now";
import {
  addTaskAction,
  deleteTaskAction,
  duplicateTaskAction,
  finishTaskAction,
  moveTaskAction,
  moveTaskByStepAction,
  postponeTaskAction,
  renameTaskAction,
  restoreTaskAction,
  suspendTaskAction,
  setTaskModeAction,
  setTaskProjectAction,
  setTaskSectionAction,
  startTaskAction,
  updateTaskEstimateAction,
  updateTaskPunchAction,
  type DailyActionResult,
} from "../actions";
import { DailyList, type EditField, type EditingCell } from "./daily-list";
import { DailySummary } from "./daily-summary";
import { DateNav } from "./date-nav";
import { ShortcutHelp } from "./shortcut-help";
import { StaleRunningBanner } from "./stale-running-banner";
import { Toast } from "./toast";

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
  const router = useRouter();
  // 直前に削除したタスク（Undo 用。O-8）
  const [deleted, setDeleted] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // 実行中タスクの経過（F-205）と終了予定時刻（F-104）のため毎分更新する。
  // 当日を表示していないときは終了予定を出さないので、実行中タスクがある場合のみ回す
  const hasRunning = optimisticGroups.some((g) =>
    g.tasks.some((t) => taskStatus(t) === "running")
  );
  const now = useNow(hasRunning || isToday);

  // 表示順に並んだタスク（選択行モデルの基盤。画面定義書01 §5）
  const orderedTasks = useMemo(
    () => optimisticGroups.flatMap((g) => g.tasks),
    [optimisticGroups]
  );

  // 選択行は描画時に導出する（§5）。未選択や、削除・日付移動で選択が消えた場合は
  // 「現在地」（実行中、なければ最初の未実行）へ自動的に戻る
  const selectedId = keepSelection(orderedTasks, rawSelectedId);

  function run(optimistic: OptimisticAction, action: () => Promise<DailyActionResult>) {
    setError(null);
    startTransition(async () => {
      dispatchOptimistic(optimistic);
      const result = await action();
      if (!result.ok) setError(result.message);
    });
  }

  // §3.4: Enter で追加 → 欄はクリアされフォーカスは残る（連続追加）。空のままの Enter は何もしない
  function add() {
    const trimmed = name.trim();
    if (trimmed === "") return;

    setName("");
    run({ type: "append", task: optimisticTask(date, trimmed) }, () =>
      addTaskAction({ date, name: trimmed })
    );
  }

  function rename(task: Task, raw: string) {
    const validated = validateTaskName(raw);
    if (!validated.ok) return; // 空名は確定不可（§8）。編集は破棄して元の名前に戻る
    if (validated.value === task.name) return;

    run({ type: "rename", id: task.id, name: validated.value }, () =>
      renameTaskAction(task.id, validated.value)
    );
  }

  function setEstimate(task: Task, raw: string) {
    const validated = validateEstimateMinutes(raw);
    if (!validated.ok) {
      setError("見積もりは分（0以上の整数）で入力してください");
      return;
    }
    if (validated.value === task.estimateMinutes) return;

    run({ type: "estimate", id: task.id, minutes: validated.value }, () =>
      updateTaskEstimateAction(task.id, raw)
    );
  }

  /** 開始 →（実行中なら）終了 のトグル（F-201 / 画面定義書01 §6 の Enter 相当） */
  function punch(task: Task) {
    const status = taskStatus(task);
    if (status === "completed") return; // 完了タスクの再打刻は提供しない

    // 打刻時刻はクライアントの現在時刻を送る（画面定義書01 §7）
    const now = new Date();
    if (status === "not_started") {
      run({ type: "start", id: task.id, at: now }, () => startTaskAction(task.id, now));
    } else {
      run({ type: "finish", id: task.id, at: now }, () => finishTaskAction(task.id, now));
    }
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

    run({ type: "punch", id: task.id, ...punch }, () =>
      updateTaskPunchAction(task.id, punch)
    );
  }

  /** ドラッグ＆ドロップでの並び替え（O-6） */
  function move(taskId: number, destination: Readonly<{ sectionId: number | null; index: number }>) {
    run({ type: "move", id: taskId, destination }, () =>
      moveTaskAction({ taskId, date, ...destination })
    );
  }

  /** モード・プロジェクト・セクションの割り当て（O-5） */
  function assign(task: Task, field: "mode" | "project" | "section", id: number | null) {
    if (field === "mode") {
      run({ type: "mode", id: task.id, modeId: id }, () => setTaskModeAction(task.id, id));
      return;
    }
    if (field === "project") {
      run({ type: "project", id: task.id, projectId: id }, () =>
        setTaskProjectAction(task.id, id)
      );
      return;
    }
    // セクション移動は移動先末尾への並び替え。表示上の位置はクライアントで決まるので楽観更新する
    const destination = optimisticGroups.find((g) => (g.section?.id ?? null) === id);
    run(
      { type: "move", id: task.id, destination: { sectionId: id, index: destination?.tasks.length ?? 0 } },
      () => setTaskSectionAction({ taskId: task.id, date, sectionId: id })
    );
  }

  /** 中断・複製・先送り・削除（F-204 / F-111 / F-107 / O-8） */
  function operate(task: Task, operation: "suspend" | "duplicate" | "postpone" | "delete") {
    if (operation === "delete") {
      run({ type: "remove", id: task.id }, async () => {
        const result = await deleteTaskAction(task.id);
        if (result.ok) setDeleted(result.deleted);
        return result;
      });
      return;
    }

    // 生成物の採番はサーバが決めるため楽観更新はしない
    setError(null);
    startTransition(async () => {
      if (operation === "duplicate") {
        const result = await duplicateTaskAction(task.id);
        if (result.ok) setSelectedId(result.createdId); // 複製したタスクを選択する（O-11）
        else setError(result.message);
        return;
      }

      const result =
        operation === "suspend"
          ? await suspendTaskAction(task.id, new Date())
          : await postponeTaskAction(task.id);
      if (!result.ok) setError(result.message);
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
   * 移動先はサーバ（moveTaskByStep）と同じ規則で求める: グループ内で1つ動かし、
   * 端に達したら隣のセクションへ移る（タスク0件のセクションも移動先になる）
   */
  function moveByStep(step: 1 | -1) {
    if (selectedId === null) return;

    const groupIndex = optimisticGroups.findIndex((g) =>
      g.tasks.some((t) => t.id === selectedId)
    );
    if (groupIndex === -1) return;

    const group = optimisticGroups[groupIndex];
    const positionInGroup = group.tasks.findIndex((t) => t.id === selectedId);
    const nextPosition = positionInGroup + step;

    let destination: Readonly<{ sectionId: number | null; index: number }>;
    if (nextPosition >= 0 && nextPosition < group.tasks.length) {
      destination = { sectionId: group.section?.id ?? null, index: nextPosition };
    } else {
      const neighborGroup = optimisticGroups[groupIndex + step];
      if (neighborGroup === undefined) return; // リスト全体の端では動かさない
      destination = {
        // 下へ動くなら移動先の先頭、上へ動くなら移動先の末尾に入る
        sectionId: neighborGroup.section?.id ?? null,
        index: step === 1 ? 0 : neighborGroup.tasks.length,
      };
    }

    run({ type: "move", id: selectedId, destination }, () =>
      moveTaskByStepAction({ taskId: selectedId, date, step })
    );
  }

  const onKeyDown = inlineEditKeyHandler({
    onEnter: add,
    onEscape: (input) => input.blur(), // Esc でフォーカスを外しリスト操作へ戻る
  });

  // Undo トーストの自動消去（O-8）は Toast コンポーネント側に一元化してある（画面定義書01 §8 / FB-15）

  useEffect(() => {
    function onKeyDownGlobal(e: KeyboardEvent) {
      // テキスト入力中・IME変換中はショートカット無効（画面定義書01 §6）
      const target = e.target as HTMLElement | null;
      if (e.isComposing || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      // 修飾キーは Shift のみ使用する（§6）。Cmd/Ctrl 併用時はブラウザの既定動作に任せる
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const selected = orderedTasks.find((t) => t.id === selectedId) ?? null;
      const requestEdit = (field: EditField) => {
        if (selected === null) return;
        // 押したキー自体が編集欄へ入力されないように既定動作を止める
        e.preventDefault();
        setEditing({ taskId: selected.id, field });
      };

      // ? は Shift+/ で入力されるため、Shift 分岐より先に処理する
      if (e.key === "?") {
        setShowHelp((v) => !v);
        return;
      }

      if (e.shiftKey) {
        switch (e.key) {
          case "J":
          case "ArrowDown":
            e.preventDefault(); // Shift+矢印の既定動作（選択範囲の拡張）を抑える
            moveByStep(1);
            return;
          case "K":
          case "ArrowUp":
            e.preventDefault();
            moveByStep(-1);
            return;
          case "H":
            router.push(`/?date=${addDays(date, -1)}`);
            return;
          case "L":
            router.push(`/?date=${addDays(date, 1)}`);
            return;
          default:
            return;
        }
      }

      switch (e.key) {
        // 選択行の移動（§5）
        case "j":
        case "ArrowDown":
          setSelectedId((current) => moveSelection(orderedTasks, current, 1));
          return;
        case "k":
        case "ArrowUp":
          setSelectedId((current) => moveSelection(orderedTasks, current, -1));
          return;
        case "c": // 現在地へジャンプ（§5）
          setSelectedId(currentTaskId(orderedTasks));
          return;
        case "Enter":
          // ボタンにフォーカスが残っている場合はブラウザがそのボタンを押すので、
          // ここで打刻すると二重に発火する（打刻ボタンを押した直後など）
          if (target?.tagName === "BUTTON") return;
          if (selected !== null) punch(selected); // 開始 →（実行中なら）終了
          return;
        case "i":
          if (selected !== null) operate(selected, "suspend");
          return;
        case "y":
          if (selected !== null) operate(selected, "duplicate");
          return;
        case "d":
          if (selected !== null) operate(selected, "delete");
          return;
        case "u":
          undoDelete();
          return;
        case "t":
          router.push("/");
          return;
        case "n":
          e.preventDefault(); // 入力欄に "n" が入るのを防ぐ
          quickAddRef.current?.focus();
          return;
        case "r":
        case "F2":
          requestEdit("name");
          return;
        case "e":
          requestEdit("estimate");
          return;
        case "b":
          requestEdit("startedAt");
          return;
        case "f":
          requestEdit("endedAt");
          return;
        case "m":
          requestEdit("mode");
          return;
        case "p":
          requestEdit("project");
          return;
        case "s":
          requestEdit("section");
          return;
        default:
          return;
      }
    }

    window.addEventListener("keydown", onKeyDownGlobal);
    return () => window.removeEventListener("keydown", onKeyDownGlobal);
  });

  return (
    <>
      {/* 日付ナビ＋サマリ（画面定義書01 §2） */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <DateNav date={date} weekday={weekdayIndex(date)} isToday={isToday} />
        <div className="flex items-baseline gap-3">
          <DailySummary groups={optimisticGroups} now={now} isToday={isToday} />
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            aria-label="キーボードショートカット"
            className="text-xs text-ink-faint hover:text-ink"
          >
            ?
          </button>
        </div>
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

      {showHelp && <ShortcutHelp onClose={() => setShowHelp(false)} />}

      {/* トースト置き場（画面定義書01 §8）。Undo とエラーが同時に出ても重ならないよう1箇所にまとめる */}
      {(deleted !== null || error !== null) && (
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
        onMove={move}
        sections={sections}
        onAssign={assign}
        onOperate={operate}
        editing={editing}
        onBeginEdit={(task, field) => setEditing({ taskId: task.id, field })}
        onEndEdit={() => setEditing(null)}
        selectedId={selectedId}
        onSelect={setSelectedId}
        now={now}
      />
    </>
  );
}
