"use client";

import { useState } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import { totalEstimateMinutes, type DailyGroup } from "@/domain/task/daily-list";
import { taskStatus } from "@/domain/task/status";
import { actualMinutes, type Task } from "@/domain/task/task";
import { formatClock, formatMinutes } from "@/app/_lib/format";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";

type Props = Readonly<{
  groups: readonly DailyGroup[];
  modes: readonly Mode[];
  projects: readonly Project[];
  onRename: (task: Task, name: string) => void;
  onEstimate: (task: Task, rawMinutes: string) => void;
}>;

const STATUS_ICON = { not_started: "・", running: "▶", completed: "✔" } as const;

// 画面定義書01 §3.2/§3.3。打刻・並び替えは後続ステップ
export function DailyList({ groups, modes, projects, onRename, onEstimate }: Props) {
  if (groups.length === 0) {
    // §7 空状態
    return <p className="mt-6 text-sm text-gray-500">ルーチンなし。タスクを追加</p>;
  }

  const modeById = new Map(modes.map((m) => [m.id, m]));
  const projectById = new Map(projects.map((p) => [p.id, p]));

  return (
    <div className="mt-4">
      {groups.map((group) => (
        <section key={group.section?.id ?? "unclassified"} className="mt-4 first:mt-0">
          <GroupHeading group={group} />
          <table className="w-full text-sm">
            <tbody>
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  mode={task.modeId === null ? undefined : modeById.get(task.modeId)}
                  project={task.projectId === null ? undefined : projectById.get(task.projectId)}
                  onRename={onRename}
                  onEstimate={onEstimate}
                />
              ))}
            </tbody>
          </table>
        </section>
      ))}
    </div>
  );
}

function GroupHeading({ group }: Readonly<{ group: DailyGroup }>) {
  const estimate = formatMinutes(totalEstimateMinutes(group.tasks));

  return (
    <div className="flex items-baseline justify-between border-b border-gray-300 py-1">
      <h2 className="text-sm font-medium">
        {group.section === null ? "未分類" : group.section.name}
        {group.section !== null && (
          <span className="ml-2 text-xs font-normal text-gray-500 tabular-nums">
            {group.section.startTime}
            {group.endTime !== null && `–${group.endTime}`}
          </span>
        )}
      </h2>
      <span className="text-xs text-gray-500 tabular-nums">見積 {estimate}</span>
    </div>
  );
}

type EditingField = "name" | "estimate" | null;

function TaskRow({
  task,
  mode,
  project,
  onRename,
  onEstimate,
}: Readonly<{
  task: Task;
  mode?: Mode;
  project?: Project;
  onRename: (task: Task, name: string) => void;
  onEstimate: (task: Task, rawMinutes: string) => void;
}>) {
  const [editing, setEditing] = useState<EditingField>(null);
  const [draft, setDraft] = useState("");
  const status = taskStatus(task);
  const actual = actualMinutes(task);

  function beginEdit(field: Exclude<EditingField, null>) {
    setDraft(field === "name" ? task.name : String(task.estimateMinutes || ""));
    setEditing(field);
  }

  function commit() {
    if (editing === "name") onRename(task, draft);
    if (editing === "estimate") onEstimate(task, draft);
    setEditing(null);
  }

  const onKeyDown = inlineEditKeyHandler({ onEnter: commit, onEscape: () => setEditing(null) });

  return (
    <tr className="border-b border-gray-100">
      <td className="w-6 py-1 text-center text-gray-500">{STATUS_ICON[status]}</td>
      <td className="w-1 py-1">
        {/* モード色バー（F-401）。未設定時は無色 */}
        <span
          style={{ backgroundColor: mode?.color ?? "transparent" }}
          className="block h-4 w-1 rounded"
          aria-hidden
        />
      </td>
      <td className="py-1">
        {editing === "name" ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            className="w-full rounded border border-gray-300 px-1 py-0.5"
          />
        ) : (
          <button
            type="button"
            onClick={() => beginEdit("name")}
            className="text-left hover:underline"
          >
            {task.name}
          </button>
        )}
        {project !== undefined && editing !== "name" && (
          <span className="ml-2 text-xs text-gray-500">{project.name}</span>
        )}
      </td>
      <td className="w-16 py-1 text-xs text-gray-500">{mode?.name}</td>
      <td className="w-16 py-1 text-right tabular-nums">
        {editing === "estimate" ? (
          <input
            autoFocus
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            placeholder="分"
            className="w-14 rounded border border-gray-300 px-1 py-0.5 text-right"
          />
        ) : (
          <button
            type="button"
            onClick={() => beginEdit("estimate")}
            className={`hover:underline ${task.estimateMinutes <= 0 ? "text-gray-300" : ""}`}
          >
            {formatMinutes(task.estimateMinutes)}
          </button>
        )}
      </td>
      <td className="w-20 py-1 text-right tabular-nums text-gray-500">
        {actual !== null && (
          <span
            className={actual > task.estimateMinutes && task.estimateMinutes > 0 ? "text-red-600" : ""}
          >
            → {formatMinutes(actual)}
          </span>
        )}
      </td>
      <td className="w-28 py-1 text-right tabular-nums text-gray-500">
        {task.startedAt !== null && (
          <>
            {formatClock(task.startedAt)}–{task.endedAt !== null ? formatClock(task.endedAt) : ""}
          </>
        )}
      </td>
    </tr>
  );
}
