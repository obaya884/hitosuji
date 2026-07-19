"use client";

import { useState } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import { totalEstimateMinutes, type DailyGroup } from "@/domain/task/daily-list";
import { taskStatus } from "@/domain/task/status";
import { actualMinutes, elapsedMinutes, type Task } from "@/domain/task/task";
import { formatClock, formatDuration, formatEstimate } from "@/app/_lib/format";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";

type Props = Readonly<{
  groups: readonly DailyGroup[];
  modes: readonly Mode[];
  projects: readonly Project[];
  onRename: (task: Task, name: string) => void;
  onEstimate: (task: Task, rawMinutes: string) => void;
  onPunch: (task: Task) => void;
  onEditPunch: (task: Task, field: "startedAt" | "endedAt", hhmm: string) => void;
  /** 毎分更新される現在時刻。実行中タスクの経過表示に使う（F-205） */
  now: Date;
}>;

const STATUS_ICON = { not_started: "・", running: "▶", completed: "✔" } as const;

// 画面定義書01 §3.2/§3.3。打刻・並び替えは後続ステップ
export function DailyList({
  groups,
  modes,
  projects,
  onRename,
  onEstimate,
  onPunch,
  onEditPunch,
  now,
}: Props) {
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
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="w-6 py-1 font-normal" />
                <th className="w-1 py-1 font-normal" />
                <th className="py-1 font-normal">タスク</th>
                <th className="w-16 py-1 font-normal">モード</th>
                <th className="w-16 py-1 text-right font-normal">見積</th>
                <th className="w-20 py-1 text-right font-normal">実績</th>
                <th className="w-28 py-1 text-right font-normal">実施時間</th>
              </tr>
            </thead>
            <tbody>
              {group.tasks.map((task) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  mode={task.modeId === null ? undefined : modeById.get(task.modeId)}
                  project={task.projectId === null ? undefined : projectById.get(task.projectId)}
                  onRename={onRename}
                  onEstimate={onEstimate}
                  onPunch={onPunch}
                  onEditPunch={onEditPunch}
                  now={now}
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
  const estimate = formatEstimate(totalEstimateMinutes(group.tasks));

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

type EditingField = "name" | "estimate" | "startedAt" | "endedAt" | null;

/** 見積もり超過は警告色（F-202）。見積もり未設定（0分）は超過判定しない */
function isOverEstimate(minutes: number, task: Task): boolean {
  return task.estimateMinutes > 0 && minutes > task.estimateMinutes;
}

function TaskRow({
  task,
  mode,
  project,
  onRename,
  onEstimate,
  onPunch,
  onEditPunch,
  now,
}: Readonly<{
  task: Task;
  mode?: Mode;
  project?: Project;
  onRename: (task: Task, name: string) => void;
  onEstimate: (task: Task, rawMinutes: string) => void;
  onPunch: (task: Task) => void;
  onEditPunch: (task: Task, field: "startedAt" | "endedAt", hhmm: string) => void;
  now: Date;
}>) {
  const [editing, setEditing] = useState<EditingField>(null);
  const [draft, setDraft] = useState("");
  const status = taskStatus(task);
  const actual = actualMinutes(task);
  const elapsed = elapsedMinutes(task, now);

  function beginEdit(field: Exclude<EditingField, null>) {
    if (field === "name") setDraft(task.name);
    if (field === "estimate") setDraft(String(task.estimateMinutes || ""));
    if (field === "startedAt") setDraft(task.startedAt === null ? "" : formatClock(task.startedAt));
    if (field === "endedAt") setDraft(task.endedAt === null ? "" : formatClock(task.endedAt));
    setEditing(field);
  }

  function commit() {
    if (editing === "name") onRename(task, draft);
    if (editing === "estimate") onEstimate(task, draft);
    if (editing === "startedAt" || editing === "endedAt") onEditPunch(task, editing, draft);
    setEditing(null);
  }

  const onKeyDown = inlineEditKeyHandler({ onEnter: commit, onEscape: () => setEditing(null) });

  return (
    <tr className="border-b border-gray-100">
      <td className="w-6 py-1 text-center">
        {/* 開始 →（実行中なら）終了 のトグル（F-201） */}
        <button
          type="button"
          onClick={() => onPunch(task)}
          disabled={status === "completed"}
          aria-label={status === "not_started" ? "開始" : status === "running" ? "終了" : "完了済み"}
          className={
            status === "running"
              ? "text-blue-600"
              : status === "completed"
                ? "text-gray-400"
                : "text-gray-500 hover:text-blue-600"
          }
        >
          {STATUS_ICON[status]}
        </button>
      </td>
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
            {formatEstimate(task.estimateMinutes)}
          </button>
        )}
      </td>
      <td className="w-20 py-1 text-right tabular-nums text-gray-500">
        {actual !== null && (
          <span className={isOverEstimate(actual, task) ? "text-red-600" : ""}>
            → {formatDuration(actual)}
          </span>
        )}
        {/* 実行中は経過をクライアントタイマーで表示（F-205） */}
        {elapsed !== null && (
          <span className={isOverEstimate(elapsed, task) ? "text-red-600" : ""}>
            (経過 {formatDuration(elapsed)})
          </span>
        )}
      </td>
      <td className="w-28 py-1 text-right tabular-nums text-gray-500">
        {/* 開始・終了時刻のインライン修正（F-203）。未打刻のタスクは編集させない */}
        {task.startedAt !== null &&
          (editing === "startedAt" || editing === "endedAt" ? (
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              onBlur={commit}
              placeholder="1935"
              className="w-16 rounded border border-gray-300 px-1 py-0.5 text-right"
            />
          ) : (
            <>
              <button
                type="button"
                onClick={() => beginEdit("startedAt")}
                className="hover:underline"
              >
                {formatClock(task.startedAt)}
              </button>
              –
              {task.endedAt !== null && (
                <button
                  type="button"
                  onClick={() => beginEdit("endedAt")}
                  className="hover:underline"
                >
                  {formatClock(task.endedAt)}
                </button>
              )}
            </>
          ))}
      </td>
    </tr>
  );
}
