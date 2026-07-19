"use client";

import { useOptimistic, useState, useTransition } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { withTaskAppended, type DailyGroup } from "@/domain/task/daily-list";
import type { Task } from "@/domain/task/task";
import { addTaskAction } from "@/app/actions";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { DailyList } from "./daily-list";

type Props = Readonly<{
  date: LogicalDate;
  groups: readonly DailyGroup[];
  modes: readonly Mode[];
  projects: readonly Project[];
}>;

/** 楽観的更新（N-01）で先に表示する仮タスク。負のIDでサーバ確定前だと分かるようにする */
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
  const [optimisticGroups, appendOptimistic] = useOptimistic(
    groups,
    (current: readonly DailyGroup[], task: Task) => withTaskAppended(current, task)
  );
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // §3.4: Enter で追加 → 欄はクリアされフォーカスは残る（連続追加）。空のままの Enter は何もしない
  function add() {
    const trimmed = name.trim();
    if (trimmed === "") return;

    setName("");
    setError(null);
    startTransition(async () => {
      appendOptimistic(optimisticTask(date, trimmed));
      const result = await addTaskAction({ date, name: trimmed });
      if (!result.ok) setError(result.message);
    });
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

      <DailyList groups={optimisticGroups} modes={modes} projects={projects} />
    </>
  );
}
