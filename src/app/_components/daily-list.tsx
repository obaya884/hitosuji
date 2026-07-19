"use client";

import { useState } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { Section } from "@/domain/section/section";
import { totalEstimateMinutes, type DailyGroup } from "@/domain/task/daily-list";
import { taskStatus } from "@/domain/task/status";
import { actualMinutes, elapsedMinutes, type Task } from "@/domain/task/task";
import { formatClock, formatDuration, formatEstimate } from "@/app/_lib/format";
import { inlineEditKeyHandler } from "@/app/_lib/keyboard";
import { RowMenu } from "./row-menu";
import { SelectPopover, type PopoverOption } from "./select-popover";

type Props = Readonly<{
  groups: readonly DailyGroup[];
  modes: readonly Mode[];
  projects: readonly Project[];
  onRename: (task: Task, name: string) => void;
  onEstimate: (task: Task, rawMinutes: string) => void;
  onPunch: (task: Task) => void;
  onEditPunch: (task: Task, field: "startedAt" | "endedAt", hhmm: string) => void;
  onMove: (taskId: number, destination: Readonly<{ sectionId: number | null; index: number }>) => void;
  sections: readonly Section[];
  onAssign: (task: Task, field: "mode" | "project" | "section", id: number | null) => void;
  onOperate: (task: Task, operation: "suspend" | "duplicate" | "postpone" | "delete") => void;
  selectedId: number | null;
  onSelect: (taskId: number) => void;
  /** 毎分更新される現在時刻。実行中タスクの経過表示に使う（F-205） */
  now: Date;
}>;

// ボタンが示すのは「押したときの動作」: 未実行→開始(▶) / 実行中→終了(■) / 完了は操作なし(✔)
const STATUS_ICON = { not_started: "▶", running: "■", completed: "✔" } as const;

// 画面定義書01 §3.2/§3.3。打刻・並び替えは後続ステップ
export function DailyList({
  groups,
  modes,
  projects,
  onRename,
  onEstimate,
  onPunch,
  onEditPunch,
  onMove,
  sections,
  onAssign,
  onOperate,
  selectedId,
  onSelect,
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
          <table
            className="w-full text-sm"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const id = Number(e.dataTransfer.getData("text/plain"));
              if (Number.isFinite(id)) {
                onMove(id, { sectionId: group.section?.id ?? null, index: group.tasks.length });
              }
            }}
          >
            <thead>
              <tr className="text-left text-xs text-gray-400">
                <th className="w-10 py-2 font-normal" />
                <th className="py-2 font-normal">タスク</th>
                <th className="w-16 py-2 font-normal">モード</th>
                <th className="w-16 py-2 text-right font-normal">見積</th>
                <th className="w-20 py-2 text-right font-normal">実績</th>
                <th className="w-28 py-2 text-right font-normal">実施時間</th>
                <th className="w-8 py-2 font-normal" />
              </tr>
            </thead>
            <tbody>
              {group.tasks.map((task, index) => (
                <TaskRow
                  key={task.id}
                  task={task}
                  index={index}
                  sectionId={group.section?.id ?? null}
                  onMove={onMove}
                  modes={modes}
                  projects={projects}
                  sections={sections}
                  onAssign={onAssign}
                  onOperate={onOperate}
                  isSelected={task.id === selectedId}
                  onSelect={onSelect}
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
    <div className="flex items-baseline justify-between border-b border-gray-300 py-2">
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

/** ポップオーバーの選択肢。アーカイブ済みマスタは選択肢に出さない（画面定義書03 §4） */
function toOptions(
  items: readonly Readonly<{ id: number; name: string; isArchived: boolean; color?: string }>[],
  noneLabel: string,
  withColor = false
): PopoverOption[] {
  return [
    { id: null, label: noneLabel },
    ...items
      .filter((item) => !item.isArchived)
      .map((item) => ({
        id: item.id,
        label: item.name,
        ...(withColor ? { color: item.color } : {}),
      })),
  ];
}

/** 見積もり超過は警告色（F-202）。見積もり未設定（0分）は超過判定しない */
function isOverEstimate(minutes: number, task: Task): boolean {
  return task.estimateMinutes > 0 && minutes > task.estimateMinutes;
}

function TaskRow({
  task,
  index,
  sectionId,
  mode,
  project,
  onMove,
  modes,
  projects,
  sections,
  onAssign,
  onOperate,
  isSelected,
  onSelect,
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
  index: number;
  sectionId: number | null;
  onMove: (taskId: number, destination: Readonly<{ sectionId: number | null; index: number }>) => void;
  modes: readonly Mode[];
  projects: readonly Project[];
  sections: readonly Section[];
  onAssign: (task: Task, field: "mode" | "project" | "section", id: number | null) => void;
  onOperate: (task: Task, operation: "suspend" | "duplicate" | "postpone" | "delete") => void;
  isSelected: boolean;
  onSelect: (taskId: number) => void;
  now: Date;
}>) {
  const [editing, setEditing] = useState<EditingField>(null);
  const [draft, setDraft] = useState("");
  const [popover, setPopover] = useState<"mode" | "project" | "section" | null>(null);
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
  // モード設定時は行の色を継承させ、未設定時のみ既定のグレーにする
  const dimmed = mode === undefined ? "text-gray-500" : "";

  return (
    <tr
      // ドラッグ＆ドロップでの並び替え（O-6）。編集中はドラッグさせない
      draggable={editing === null}
      onDragStart={(e) => e.dataTransfer.setData("text/plain", String(task.id))}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const draggedId = Number(e.dataTransfer.getData("text/plain"));
        if (Number.isFinite(draggedId) && draggedId !== task.id) {
          onMove(draggedId, { sectionId, index });
        }
      }}
      onClick={() => onSelect(task.id)}
      // モード色は行全体のテキスト色に反映する（F-401 / 画面定義書01 §2）
      style={mode === undefined ? undefined : { color: mode.color }}
      className={`border-b border-gray-100 ${isSelected ? "bg-blue-50" : ""}`}
    >
      <td className="w-10 py-3">
        {/* 開始 →（実行中なら）終了 のトグル（F-201）。押しやすさのため円形ボタンにする */}
        <button
          type="button"
          onClick={() => onPunch(task)}
          disabled={status === "completed"}
          aria-label={status === "not_started" ? "開始" : status === "running" ? "終了" : "完了済み"}
          className={`flex h-7 w-7 items-center justify-center rounded-full text-xs ${
            status === "running"
              ? "bg-blue-600 text-white"
              : status === "completed"
                ? "text-gray-400"
                : "border border-gray-300 text-gray-500 hover:border-blue-600 hover:text-blue-600"
          }`}
        >
          {STATUS_ICON[status]}
        </button>
      </td>
      <td className="py-3">
        {editing === "name" ? (
          <input
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            className="w-full rounded border border-gray-300 px-1 py-1"
          />
        ) : (
          <button type="button" onClick={() => beginEdit("name")} className="text-left hover:underline">
            {task.name}
          </button>
        )}
        {editing !== "name" && (
          <span className="relative ml-2 inline-flex gap-2 text-xs">
            {/* プロジェクト選択ポップオーバー（O-5） */}
            <button
              type="button"
              onClick={() => setPopover("project")}
              className={`hover:underline ${dimmed}`}
            >
              {project?.name ?? <span className="opacity-50">プロジェクト</span>}
            </button>
            {popover === "project" && (
              <SelectPopover
                options={toOptions(projects, "プロジェクトなし")}
                selectedId={task.projectId}
                onSelect={(id) => onAssign(task, "project", id)}
                onClose={() => setPopover(null)}
              />
            )}
            {/* セクション選択ポップオーバー（O-5） */}
            <button
              type="button"
              onClick={() => setPopover("section")}
              className={`hover:underline ${dimmed} opacity-80`}
            >
              {sections.find((s) => s.id === task.sectionId)?.name ?? "未分類"}
            </button>
            {popover === "section" && (
              <SelectPopover
                options={toOptions(sections, "未分類")}
                selectedId={task.sectionId}
                onSelect={(id) => onAssign(task, "section", id)}
                onClose={() => setPopover(null)}
              />
            )}
          </span>
        )}
      </td>
      <td className={`relative w-16 py-3 text-xs ${dimmed}`}>
        {/* モード選択ポップオーバー（O-5） */}
        <button type="button" onClick={() => setPopover("mode")} className="hover:underline">
          {mode?.name ?? <span className="opacity-50">モード</span>}
        </button>
        {popover === "mode" && (
          <SelectPopover
            options={toOptions(modes, "モードなし", true)}
            selectedId={task.modeId}
            onSelect={(id) => onAssign(task, "mode", id)}
            onClose={() => setPopover(null)}
          />
        )}
      </td>
      <td className="w-16 py-3 text-right tabular-nums">
        {editing === "estimate" ? (
          <input
            autoFocus
            inputMode="numeric"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            onBlur={commit}
            placeholder="分"
            className="w-14 rounded border border-gray-300 px-1 py-1 text-right"
          />
        ) : (
          <button
            type="button"
            onClick={() => beginEdit("estimate")}
            className={`hover:underline ${task.estimateMinutes <= 0 ? "opacity-40" : ""}`}
          >
            {formatEstimate(task.estimateMinutes)}
          </button>
        )}
      </td>
      <td className={`w-20 py-3 text-right tabular-nums ${dimmed}`}>
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
      <td className={`w-28 py-3 text-right tabular-nums ${dimmed}`}>
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
              className="w-16 rounded border border-gray-300 px-1 py-1 text-right"
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
      <td className="w-8 py-3">
        <RowMenu
          items={[
            {
              label: "中断",
              onSelect: () => onOperate(task, "suspend"),
              disabled: status !== "running", // 実行中のみ（F-204）
            },
            { label: "複製", onSelect: () => onOperate(task, "duplicate") },
            {
              label: "翌日へ先送り",
              onSelect: () => onOperate(task, "postpone"),
              disabled: status !== "not_started", // 未実行のみ（F-107）
            },
            {
              label: "削除",
              onSelect: () => onOperate(task, "delete"),
              // 打刻済みは確認ダイアログ（O-8）
              confirmMessage:
                status === "not_started"
                  ? undefined
                  : `「${task.name}」は打刻済みです。削除しますか？`,
            },
          ]}
        />
      </td>
    </tr>
  );
}
