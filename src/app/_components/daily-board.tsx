"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { LogicalDate } from "@/domain/shared/logical-date";
import {
  withTaskAppended,
  withTaskUpdated,
  type DailyGroup,
} from "@/domain/task/daily-list";
import { validateEstimateMinutes, validateTaskName } from "@/domain/task/task-edit";
import type { Task } from "@/domain/task/task";
import {
  addTaskAction,
  renameTaskAction,
  updateTaskEstimateAction,
  type DailyActionResult,
} from "@/app/actions";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { DailyList } from "./daily-list";

type Props = Readonly<{
  date: LogicalDate;
  groups: readonly DailyGroup[];
  modes: readonly Mode[];
  projects: readonly Project[];
}>;

// 楽観的更新（N-01）: 永続化を待たずに画面へ反映し、失敗時はサーバ状態へ巻き戻す
type OptimisticAction =
  | Readonly<{ type: "append"; task: Task }>
  | Readonly<{ type: "rename"; id: number; name: string }>
  | Readonly<{ type: "estimate"; id: number; minutes: number }>;

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
  }
}

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

export function DailyBoard({ date, groups, modes, projects }: Props) {
  const [optimisticGroups, dispatchOptimistic] = useOptimistic(groups, applyOptimisticAction);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

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

  const onKeyDown = inlineEditKeyHandler({
    onEnter: add,
    onEscape: (input) => input.blur(), // Esc でフォーカスを外しリスト操作へ戻る
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

      <DailyList
        groups={optimisticGroups}
        modes={modes}
        projects={projects}
        onRename={rename}
        onEstimate={setEstimate}
      />
    </>
  );
}
