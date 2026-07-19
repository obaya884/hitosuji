"use client";

import { useEffect, useOptimistic, useState, useTransition } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { Section } from "@/domain/section/section";
import type { LogicalDate } from "@/domain/shared/logical-date";
import {
  withTaskAppended,
  withTaskMoved,
  withTaskUpdated,
  type DailyGroup,
} from "@/domain/task/daily-list";
import { taskStatus } from "@/domain/task/status";
import { editEndedAt, editStartedAt } from "@/domain/task/punch-edit";
import { validateEstimateMinutes, validateTaskName } from "@/domain/task/task-edit";
import type { Task } from "@/domain/task/task";
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
} from "@/app/actions";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { useNow } from "@/app/_lib/use-now";
import { DailyList } from "./daily-list";

type Props = Readonly<{
  date: LogicalDate;
  groups: readonly DailyGroup[];
  modes: readonly Mode[];
  projects: readonly Project[];
  sections: readonly Section[];
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

export function DailyBoard({ date, groups, modes, projects, sections }: Props) {
  const [optimisticGroups, dispatchOptimistic] = useOptimistic(groups, applyOptimisticAction);
  const [name, setName] = useState("");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  // 直前に削除したタスク（Undo 用。O-8）
  const [deleted, setDeleted] = useState<Task | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // 実行中タスクがあるときだけ毎分更新する（F-205）
  const hasRunning = optimisticGroups.some((g) =>
    g.tasks.some((t) => taskStatus(t) === "running")
  );
  const now = useNow(hasRunning);

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
    // セクション移動は移動先末尾への並び替えを伴うため、採番はサーバに委ねる
    setError(null);
    startTransition(async () => {
      const result = await setTaskSectionAction({ taskId: task.id, date, sectionId: id });
      if (!result.ok) setError(result.message);
    });
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
      const result =
        operation === "suspend"
          ? await suspendTaskAction(task.id, new Date())
          : operation === "duplicate"
            ? await duplicateTaskAction(task.id)
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

  /** Shift+J/K での並び替え（画面定義書01 §6）。採番はサーバが決めるので楽観更新はしない */
  function moveByStep(step: 1 | -1) {
    if (selectedId === null) return;
    setError(null);
    startTransition(async () => {
      const result = await moveTaskByStepAction({ taskId: selectedId, date, step });
      if (!result.ok) setError(result.message);
    });
  }

  const onKeyDown = inlineEditKeyHandler({
    onEnter: add,
    onEscape: (input) => input.blur(), // Esc でフォーカスを外しリスト操作へ戻る
  });

  // Undo トーストは5秒で消える（O-8）
  useEffect(() => {
    if (deleted === null) return;
    const timeoutId = setTimeout(() => setDeleted(null), 5000);
    return () => clearTimeout(timeoutId);
  }, [deleted]);

  useEffect(() => {
    function onKeyDownGlobal(e: KeyboardEvent) {
      // テキスト入力中・IME変換中はショートカット無効（画面定義書01 §6）
      const target = e.target as HTMLElement | null;
      if (e.isComposing || target?.tagName === "INPUT" || target?.tagName === "TEXTAREA") return;
      // U: 直前の削除を取り消す（画面定義書01 §6）
      if (!e.shiftKey && (e.key === "u" || e.key === "U")) {
        undoDelete();
        return;
      }
      if (!e.shiftKey) return;

      if (e.key === "J") moveByStep(1);
      if (e.key === "K") moveByStep(-1);
    }

    window.addEventListener("keydown", onKeyDownGlobal);
    return () => window.removeEventListener("keydown", onKeyDownGlobal);
  });

  return (
    <>
      <div className="mt-3 flex items-center gap-2">
        <span className="text-gray-400">＋</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="タスク名を入力して Enter で追加"
          className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
        />
      </div>

      {error !== null && (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {/* 削除の Undo トースト（O-8） */}
      {deleted !== null && (
        <div className="fixed bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-3 rounded bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">
          <span>「{deleted.name}」を削除しました</span>
          <button type="button" onClick={undoDelete} className="font-medium text-blue-300 hover:underline">
            取り消す
          </button>
        </div>
      )}

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
        selectedId={selectedId}
        onSelect={setSelectedId}
        now={now}
      />
    </>
  );
}
