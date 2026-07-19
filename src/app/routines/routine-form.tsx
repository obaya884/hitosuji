"use client";

import { useState } from "react";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import { WEEKDAY_BITS, toggleWeekday, type RecurrenceType, type Routine } from "@/domain/routine/routine";
import type { RoutineInput } from "@/domain/routine/routine-input";

type Props = Readonly<{
  routine: Routine | null;
  modes: readonly Mode[];
  projects: readonly Project[];
  today: string;
  onSubmit: (input: RoutineInput) => void;
  onCancel: () => void;
}>;

const RECURRENCE_LABELS: Readonly<Record<RecurrenceType, string>> = {
  daily: "毎日",
  weekly: "週次",
  monthly: "月次",
  interval: "n日ごと",
};

/** 新規/編集フォーム（画面定義書02 §4）。繰り返し種別に応じて入力項目を出し分ける */
export function RoutineForm({ routine, modes, projects, today, onSubmit, onCancel }: Props) {
  const [name, setName] = useState(routine?.name ?? "");
  const [estimateMinutes, setEstimateMinutes] = useState(String(routine?.estimateMinutes ?? 15));
  const [scheduledStartTime, setScheduledStartTime] = useState(
    routine?.scheduledStartTime ?? "09:00"
  );
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    routine?.recurrenceType ?? "daily"
  );
  const [weekdays, setWeekdays] = useState(routine?.weekdays ?? 0);
  const [monthDay, setMonthDay] = useState(String(routine?.monthDay ?? 1));
  const [intervalDays, setIntervalDays] = useState(String(routine?.intervalDays ?? 2));
  const [startDate, setStartDate] = useState(routine?.startDate ?? today);
  const [endDate, setEndDate] = useState(routine?.endDate ?? "");
  const [modeId, setModeId] = useState(routine?.modeId ?? null);
  const [projectId, setProjectId] = useState(routine?.projectId ?? null);

  function submit() {
    onSubmit({
      name,
      estimateMinutes: Number(estimateMinutes),
      scheduledStartTime,
      modeId,
      projectId,
      recurrenceType,
      weekdays: recurrenceType === "weekly" ? weekdays : null,
      monthDay: recurrenceType === "monthly" ? Number(monthDay) : null,
      intervalDays: recurrenceType === "interval" ? Number(intervalDays) : null,
      startDate,
      endDate: endDate === "" ? null : endDate,
    });
  }

  return (
    <div className="mt-3 rounded border border-gray-300 p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-xs text-gray-500">名前</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="朝食"
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-xs text-gray-500">見積もり（分）</span>
            <input
              inputMode="numeric"
              value={estimateMinutes}
              onChange={(e) => setEstimateMinutes(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs text-gray-500">開始想定時刻</span>
            <input
              type="time"
              value={scheduledStartTime}
              onChange={(e) => setScheduledStartTime(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            />
          </label>
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="text-xs text-gray-500">繰り返し</legend>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          {(Object.keys(RECURRENCE_LABELS) as RecurrenceType[]).map((type) => (
            <label key={type} className="flex items-center gap-1">
              <input
                type="radio"
                name="recurrenceType"
                checked={recurrenceType === type}
                onChange={() => setRecurrenceType(type)}
              />
              {RECURRENCE_LABELS[type]}
            </label>
          ))}
        </div>

        {recurrenceType === "weekly" && (
          <div className="mt-2 flex flex-wrap gap-2 text-sm">
            {WEEKDAY_BITS.map((weekday) => (
              <label key={weekday.bit} className="flex items-center gap-1">
                <input
                  type="checkbox"
                  checked={(weekdays & (1 << weekday.bit)) !== 0}
                  onChange={() => setWeekdays((v) => toggleWeekday(v, weekday.bit))}
                />
                {weekday.label}
              </label>
            ))}
          </div>
        )}

        {recurrenceType === "monthly" && (
          <label className="mt-2 block text-sm">
            <input
              inputMode="numeric"
              value={monthDay}
              onChange={(e) => setMonthDay(e.target.value)}
              className="w-16 rounded border border-gray-300 px-2 py-1"
            />
            <span className="ml-2 text-xs text-gray-500">
              日（31日など存在しない月は月末に丸めます）
            </span>
          </label>
        )}

        {recurrenceType === "interval" && (
          <label className="mt-2 block text-sm">
            <input
              inputMode="numeric"
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value)}
              className="w-16 rounded border border-gray-300 px-2 py-1"
            />
            <span className="ml-2 text-xs text-gray-500">日ごと（開始日が起算日）</span>
          </label>
        )}
      </fieldset>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-xs text-gray-500">開始日</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            />
          </label>
          <label className="text-sm">
            <span className="text-xs text-gray-500">終了日（任意）</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-xs text-gray-500">モード</span>
            <select
              value={modeId ?? ""}
              onChange={(e) => setModeId(e.target.value === "" ? null : Number(e.target.value))}
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            >
              <option value="">なし</option>
              {modes.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-gray-500">プロジェクト</span>
            <select
              value={projectId ?? ""}
              onChange={(e) =>
                setProjectId(e.target.value === "" ? null : Number(e.target.value))
              }
              className="mt-1 w-full rounded border border-gray-300 px-2 py-1"
            >
              <option value="">なし</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="mt-3 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1 text-sm text-gray-500">
          取消
        </button>
        <button
          type="button"
          onClick={submit}
          className="rounded bg-blue-600 px-3 py-1 text-sm font-medium text-white"
        >
          保存
        </button>
      </div>
    </div>
  );
}
