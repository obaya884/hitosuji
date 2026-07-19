"use client";

import { useState, useTransition } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import { describeRecurrence, type Routine } from "@/domain/routine/routine";
import type { RoutineInput } from "@/domain/routine/routine-input";
import { sectionAt, type Section } from "@/domain/section/section";
import { formatEstimate } from "@/app/_lib/format";
import {
  createRoutineAction,
  deleteRoutineAction,
  setRoutineActiveAction,
  updateRoutineAction,
  type RoutineActionResult,
} from "./actions";
import { RoutineForm } from "./routine-form";

type Props = Readonly<{
  routines: readonly Routine[];
  modes: readonly Mode[];
  projects: readonly Project[];
  sections: readonly Section[];
  today: string;
}>;

/** 一覧（画面定義書02 §3）。並び順は開始想定時刻の昇順（展開後のデイリーと同じ並び） */
export function RoutinesTable({ routines, modes, projects, sections, today }: Props) {
  const [editing, setEditing] = useState<Routine | "new" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const modeById = new Map(modes.map((m) => [m.id, m]));

  function run(action: () => Promise<RoutineActionResult>, onSuccess?: () => void) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) onSuccess?.();
      else setError(result.message);
    });
  }

  function save(input: RoutineInput) {
    const action =
      editing === "new"
        ? () => createRoutineAction(input)
        : () => updateRoutineAction((editing as Routine).id, input);
    run(action, () => setEditing(null));
  }

  return (
    <section className="mt-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-gray-500">
          有効なルーチンは、デイリーリストで対象日を表示したときに自動で展開されます（当日以降のみ）。
        </p>
        <button
          onClick={() => {
            setError(null);
            setEditing("new");
          }}
          className="rounded border border-gray-300 px-3 py-1 text-sm"
        >
          ＋ 新規ルーチン
        </button>
      </div>

      {error !== null && (
        <p className="mt-2 rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      )}

      {editing === "new" && (
        <RoutineForm
          routine={null}
          modes={modes}
          projects={projects}
          today={today}
          onSubmit={save}
          onCancel={() => setEditing(null)}
        />
      )}

      <table className="mt-3 w-full text-sm">
        <thead>
          <tr className="border-b border-gray-300 text-left text-xs text-gray-400">
            <th className="w-12 py-2 font-normal">有効</th>
            <th className="py-2 font-normal">名前</th>
            <th className="w-16 py-2 text-right font-normal">見積</th>
            <th className="w-40 py-2 font-normal">繰り返し</th>
            <th className="w-36 py-2 font-normal">開始想定</th>
            <th className="w-24 py-2 font-normal" />
          </tr>
        </thead>
        <tbody>
          {routines.map((routine) => {
            const mode = routine.modeId === null ? undefined : modeById.get(routine.modeId);
            const section = sectionAt(sections, routine.scheduledStartTime);
            const isEditing = editing !== null && editing !== "new" && editing.id === routine.id;

            return (
              <tr
                key={routine.id}
                // 無効ルーチンはグレーアウト（画面定義書02 §3）
                className={`border-b border-gray-100 ${routine.isActive ? "" : "text-gray-400"}`}
                style={
                  routine.isActive && mode !== undefined ? { color: mode.color } : undefined
                }
              >
                <td className="py-2">
                  <input
                    type="checkbox"
                    checked={routine.isActive}
                    disabled={isPending}
                    onChange={(e) =>
                      run(() => setRoutineActiveAction(routine.id, e.target.checked))
                    }
                    aria-label={`${routine.name} を有効にする`}
                  />
                </td>
                <td className="py-2">{routine.name}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatEstimate(routine.estimateMinutes)}
                </td>
                <td className="py-2 text-xs">{describeRecurrence(routine)}</td>
                <td className="py-2 text-xs tabular-nums">
                  {routine.scheduledStartTime}
                  {section !== undefined && (
                    <span className="ml-1 text-gray-500">({section.name})</span>
                  )}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => {
                      setError(null);
                      setEditing(isEditing ? null : routine);
                    }}
                    className="px-2 text-blue-600"
                  >
                    {isEditing ? "閉じる" : "編集"}
                  </button>
                  <button
                    onClick={() => {
                      if (
                        !window.confirm(
                          `「${routine.name}」を削除しますか？\n展開済みのタスクは残ります。`
                        )
                      ) {
                        return;
                      }
                      run(() => deleteRoutineAction(routine.id));
                    }}
                    disabled={isPending}
                    className="px-2 text-gray-500"
                  >
                    削除
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {routines.length === 0 && editing === null && (
        <p className="mt-4 text-sm text-gray-500">ルーチンはまだありません。</p>
      )}

      {editing !== null && editing !== "new" && (
        <RoutineForm
          key={editing.id}
          routine={editing}
          modes={modes}
          projects={projects}
          today={today}
          onSubmit={save}
          onCancel={() => setEditing(null)}
        />
      )}
    </section>
  );
}
