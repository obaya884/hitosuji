"use client";

import { useState, useTransition } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import { describeRecurrence, type Routine } from "@/domain/routine/routine";
import type { RoutineInput } from "@/domain/routine/routine-input";
import { sectionAt, type Section } from "@/domain/section/section";
import { formatEstimate } from "@/app/_lib/format";
import { btnSecondary, linkAccent, linkMuted, noticeDanger } from "@/app/_lib/ui";
import { PlusIcon } from "@/app/_components/icons";
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
        <p className="text-xs text-ink-muted">
          有効なルーチンは、デイリーリストで対象日を表示したときに自動で展開されます（当日以降のみ）。
        </p>
        <button
          onClick={() => {
            setError(null);
            setEditing("new");
          }}
          className={`inline-flex shrink-0 items-center gap-1 ${btnSecondary}`}
        >
          <PlusIcon className="h-3 w-3" />
          新規ルーチン
        </button>
      </div>

      {error !== null && (
        <p className={`mt-2 ${noticeDanger}`}>
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
          <tr className="border-b border-line-strong text-left text-xs text-ink-muted">
            <th className="w-12 py-2 font-normal">有効</th>
            <th className="py-2 font-normal">名前</th>
            <th className="w-20 py-2 pr-4 text-right font-normal">見積</th>
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
                className={`border-b border-line ${routine.isActive ? "" : "text-ink-faint"}`}
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
                    className="accent-accent"
                  />
                </td>
                <td className="py-2">{routine.name}</td>
                <td className="py-2 pr-4 text-right font-mono tabular-nums">
                  {formatEstimate(routine.estimateMinutes)}
                </td>
                <td className="py-2 text-xs">{describeRecurrence(routine)}</td>
                <td className="py-2 text-xs tabular-nums">
                  <span className="font-mono">{routine.scheduledStartTime}</span>
                  {section !== undefined && (
                    <span className="ml-1 text-ink-muted">({section.name})</span>
                  )}
                </td>
                <td className="py-2 text-right whitespace-nowrap">
                  <button
                    onClick={() => {
                      setError(null);
                      setEditing(isEditing ? null : routine);
                    }}
                    className={`px-2 ${linkAccent}`}
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
                    className={`px-2 ${linkMuted}`}
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
        <p className="mt-4 text-sm text-ink-muted">ルーチンはまだありません。</p>
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
