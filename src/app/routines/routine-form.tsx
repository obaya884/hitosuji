"use client";

import { useState } from "react";
import type { Bundle } from "@/domain/bundle/bundle";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import {
  WEEKDAY_BITS,
  WEEKDAY_PRESETS,
  toggleWeekday,
  type RecurrenceType,
  type Routine,
} from "@/domain/routine/routine";
import type { RoutineInput } from "@/domain/routine/input";
import { btnPrimary, btnSecondary, inputBase, linkMuted } from "@/app/_lib/ui";
import { UNSET_LABEL } from "@/app/_lib/unset";

type Props = Readonly<{
  routine: Routine | null;
  /** 選択肢。アーカイブ済みは含めない（画面定義書02 §4）。すでに別のバンドルに属していても
   *  ここでは付け替えられる（S-05 O-5 が候補を未所属に絞るのとは非対称。§4 に理由あり） */
  bundles: readonly Bundle[];
  modes: readonly Mode[];
  projects: readonly Project[];
  today: string;
  /** 保存中（Server Action の応答待ち） */
  isPending: boolean;
  onSubmit: (input: RoutineInput) => void;
  onCancel: () => void;
}>;

const RECURRENCE_LABELS: Readonly<Record<RecurrenceType, string>> = {
  daily: "毎日",
  weekly: "週次",
  monthly: "月次",
  interval: "n日ごと",
};

/**
 * 新規/編集フォーム（画面定義書02 §4）。繰り返し種別に応じて入力項目を出し分ける。
 *
 * 保存中（`isPending`）は 00_共通 §2.3 に従い、確定（保存）・取消と、**送信せず表示だけを
 * 変えるその場の選択**（繰り返し種別・曜日・モード/プロジェクト）を止める。
 * **テキスト入力欄は触れるままにする**——失敗して戻ってきたときに入力し直せるようにするため
 * （同書 §2.3「失敗時」）。値を送るのは保存ボタンだけなので、打っている間に送信は起きない
 */
export function RoutineForm({
  routine,
  bundles,
  modes,
  projects,
  today,
  isPending,
  onSubmit,
  onCancel,
}: Props) {
  const [name, setName] = useState(routine?.name ?? "");
  const [estimateMinutes, setEstimateMinutes] = useState(String(routine?.estimateMinutes ?? 15));
  const [scheduledStartTime, setScheduledStartTime] = useState(
    routine?.scheduledStartTime ?? "09:00"
  );
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(
    routine?.recurrenceType ?? "daily"
  );
  const [weekdays, setWeekdays] = useState(routine?.weekdays ?? 0);
  const [weekInterval, setWeekInterval] = useState(String(routine?.weekInterval ?? 1));
  const [monthDay, setMonthDay] = useState(String(routine?.monthDay ?? 1));
  const [intervalDays, setIntervalDays] = useState(String(routine?.intervalDays ?? 2));
  const [startDate, setStartDate] = useState(routine?.startDate ?? today);
  const [endDate, setEndDate] = useState(routine?.endDate ?? "");
  const [modeId, setModeId] = useState(routine?.modeId ?? null);
  const [projectId, setProjectId] = useState(routine?.projectId ?? null);
  const [bundleId, setBundleId] = useState(routine?.bundleId ?? null);

  function submit() {
    onSubmit({
      name,
      estimateMinutes: Number(estimateMinutes),
      scheduledStartTime,
      modeId,
      projectId,
      bundleId,
      recurrenceType,
      weekdays: recurrenceType === "weekly" ? weekdays : null,
      weekInterval: recurrenceType === "weekly" ? Number(weekInterval) : null,
      monthDay: recurrenceType === "monthly" ? Number(monthDay) : null,
      intervalDays: recurrenceType === "interval" ? Number(intervalDays) : null,
      startDate,
      endDate: endDate === "" ? null : endDate,
    });
  }

  return (
    <div className="mt-3 rounded-float border border-line bg-surface p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm">
          <span className="text-xs text-ink-muted">名前</span>
          <input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="朝食"
            className={`mt-1 w-full ${inputBase}`}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-xs text-ink-muted">見積もり（分）</span>
            <input
              type="number"
              min={1}
              value={estimateMinutes}
              onChange={(e) => setEstimateMinutes(e.target.value)}
              className={`mt-1 w-full ${inputBase}`}
            />
          </label>
          <label className="text-sm">
            <span className="text-xs text-ink-muted">開始想定時刻</span>
            <input
              type="time"
              value={scheduledStartTime}
              onChange={(e) => setScheduledStartTime(e.target.value)}
              className={`mt-1 w-full ${inputBase}`}
            />
          </label>
        </div>
      </div>

      <fieldset className="mt-3">
        <legend className="text-xs text-ink-muted">繰り返し</legend>
        <div className="mt-1 flex flex-wrap gap-3 text-sm">
          {(Object.keys(RECURRENCE_LABELS) as RecurrenceType[]).map((type) => (
            <label key={type} className="flex items-center gap-1">
              <input
                type="radio"
                name="recurrenceType"
                checked={recurrenceType === type}
                disabled={isPending}
                onChange={() => setRecurrenceType(type)}
                className="accent-accent"
              />
              {RECURRENCE_LABELS[type]}
            </label>
          ))}
        </div>

        {recurrenceType === "weekly" && (
          <div className="mt-2 space-y-2 text-sm">
            {/* 曜日の入力補助（画面定義書02 §4）。押すと該当曜日だけが選択された状態になる */}
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_PRESETS.map((preset) => (
                <button
                  key={preset.label}
                  type="button"
                  disabled={isPending}
                  onClick={() => setWeekdays(preset.mask)}
                  className={btnSecondary}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              {WEEKDAY_BITS.map((weekday) => (
                <label key={weekday.bit} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={(weekdays & (1 << weekday.bit)) !== 0}
                    disabled={isPending}
                    onChange={() => setWeekdays((v) => toggleWeekday(v, weekday.bit))}
                    className="accent-accent"
                  />
                  {weekday.label}
                </label>
              ))}
            </div>
            <label className="block">
              <span className="text-xs text-ink-muted">週間隔</span>
              <input
                type="number"
                min={1}
                max={53}
                value={weekInterval}
                onChange={(e) => setWeekInterval(e.target.value)}
                className={`ml-2 w-16 ${inputBase}`}
              />
              <span className="ml-2 text-xs text-ink-muted">週おき（1=毎週・2=隔週）</span>
            </label>
          </div>
        )}

        {recurrenceType === "monthly" && (
          <label className="mt-2 block text-sm">
            <input
              type="number"
              min={1}
              max={31}
              value={monthDay}
              onChange={(e) => setMonthDay(e.target.value)}
              className={`w-16 ${inputBase}`}
            />
            <span className="ml-2 text-xs text-ink-muted">
              日（31日など存在しない月は月末に丸めます）
            </span>
          </label>
        )}

        {recurrenceType === "interval" && (
          <label className="mt-2 block text-sm">
            <input
              type="number"
              min={1}
              value={intervalDays}
              onChange={(e) => setIntervalDays(e.target.value)}
              className={`w-16 ${inputBase}`}
            />
            <span className="ml-2 text-xs text-ink-muted">日ごと（開始日が起算日）</span>
          </label>
        )}
      </fieldset>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-xs text-ink-muted">開始日</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className={`mt-1 w-full ${inputBase}`}
            />
          </label>
          <label className="text-sm">
            <span className="text-xs text-ink-muted">終了日（任意）</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className={`mt-1 w-full ${inputBase}`}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm">
            <span className="text-xs text-ink-muted">モード</span>
            <select
              value={modeId ?? ""}
              disabled={isPending}
              onChange={(e) => setModeId(e.target.value === "" ? null : Number(e.target.value))}
              className={`mt-1 w-full ${inputBase}`}
            >
              <option value="">{UNSET_LABEL}</option>
              {modes.map((mode) => (
                <option key={mode.id} value={mode.id}>
                  {mode.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm">
            <span className="text-xs text-ink-muted">プロジェクト</span>
            <select
              value={projectId ?? ""}
              disabled={isPending}
              onChange={(e) =>
                setProjectId(e.target.value === "" ? null : Number(e.target.value))
              }
              className={`mt-1 w-full ${inputBase}`}
            >
              <option value="">{UNSET_LABEL}</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {/* 2列に並べる相手がいないので枠は作らない（グリッドにすると右半分が常に空く） */}
      <label className="mt-3 block text-sm">
        <span className="text-xs text-ink-muted">バンドル</span>
        <select
          value={bundleId ?? ""}
          disabled={isPending}
          onChange={(e) => setBundleId(e.target.value === "" ? null : Number(e.target.value))}
          className={`mt-1 w-full ${inputBase}`}
        >
          <option value="">{UNSET_LABEL}</option>
          {bundles.map((bundle) => (
            <option key={bundle.id} value={bundle.id}>
              {bundle.name}
            </option>
          ))}
        </select>
      </label>

      {/* 保存中は確定も取消も止める（00_共通 §2.3。連打は二重に作り、応答待ちの取消は入力を失わせる） */}
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          disabled={isPending}
          className={`px-3 py-1 ${linkMuted}`}
        >
          取消
        </button>
        <button type="button" onClick={submit} disabled={isPending} className={btnPrimary}>
          保存
        </button>
      </div>
    </div>
  );
}
