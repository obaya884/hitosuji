"use client";

import { useState } from "react";
import {
  toggleWeekday,
  WEEKDAY_BITS,
  type RecurrenceType,
} from "@/domain/routine/routine";
import {
  defaultChoiceFromTask,
  type RoutineFromTaskChoice,
} from "@/domain/routine/from-task";
import { sectionAt } from "@/domain/section/section";
import type { Section } from "@/domain/section/section";
import { parseClockTime } from "@/domain/task/punch-edit";
import type { Task } from "@/domain/task/task";
import { formatClock } from "@/app/_lib/format";
import { btnPrimary, floatPanel, inputBase } from "@/app/_lib/ui";
import { useDismiss } from "@/app/_lib/use-dismiss";
import { useFlipUp } from "@/app/_lib/use-flip-up";

const RECURRENCE_LABELS: Readonly<Record<RecurrenceType, string>> = {
  daily: "毎日",
  weekly: "週次",
  monthly: "月次",
  interval: "n日ごと",
};

type Props = Readonly<{
  task: Task;
  sections: readonly Section[];
  /** 開始想定時刻の既定値を決めるための現在時刻（未打刻・未分類のとき） */
  now: Date;
  onSubmit: (choice: RoutineFromTaskChoice) => void;
  onClose: () => void;
}>;

/**
 * 開始想定時刻の既定値（画面定義書01 §4.1）:
 * 打刻済みならその開始時刻 → 属するセクションの開始時刻 → 現在時刻 の順で決める
 */
function defaultStartTime(task: Task, sections: readonly Section[], now: Date): string {
  if (task.startedAt !== null) return formatClock(task.startedAt);
  const section = sections.find((s) => s.id === task.sectionId);
  return section?.startTime ?? formatClock(now);
}

/**
 * タスクからのルーチン化（画面定義書01 §4.1 / O-12）。
 * 名前・見積もり・モード・プロジェクトはタスクから引き継ぐため、
 * ここで聞くのは繰り返し種別と開始想定時刻だけにする（N-05）
 */
export function RoutinizePopover({ task, sections, now, onSubmit, onClose }: Props) {
  // 画面下部の行では上向きに開く（§7「ポップオーバーの表示位置」）
  const { ref, positionClass } = useFlipUp<HTMLDivElement>();
  const [choice, setChoice] = useState<RoutineFromTaskChoice>(() =>
    defaultChoiceFromTask(task, defaultStartTime(task, sections, now))
  );
  const [timeError, setTimeError] = useState<string | null>(null);

  // 外側クリック＋Esc で閉じる
  useDismiss(ref, onClose);

  /** 入力された時刻を `HH:MM` へ整形する（不正なら元の入力のまま返す） */
  function normalized(current: RoutineFromTaskChoice): string {
    const parsed = parseClockTime(current.scheduledStartTime);
    if (!parsed.ok) return current.scheduledStartTime;
    const { hours, minutes } = parsed.value;
    return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  }

  function submit() {
    const scheduledStartTime = normalized(choice);
    if (!parseClockTime(scheduledStartTime).ok) {
      setTimeError("開始想定時刻は HH:MM で入力してください");
      return;
    }
    onSubmit({ ...choice, scheduledStartTime });
  }

  // 開始想定時刻から導出されるセクション（展開先の目安。F-302 と同じ導出）
  const derivedSection = sectionAt(sections, choice.scheduledStartTime);

  return (
    <div
      ref={ref}
      className={`absolute right-0 z-10 w-64 space-y-2 p-3 text-left text-sm ${positionClass} ${floatPanel}`}
    >
      <p className="font-medium">ルーチン化</p>

      <div className="flex flex-wrap gap-1">
        {(Object.keys(RECURRENCE_LABELS) as RecurrenceType[]).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setChoice((c) => ({ ...c, recurrenceType: type }))}
            aria-pressed={choice.recurrenceType === type}
            className={`rounded-control border px-2 py-1 text-xs ${
              choice.recurrenceType === type
                ? "border-accent bg-accent-weak font-medium"
                : "border-line hover:bg-accent-weak"
            }`}
          >
            {RECURRENCE_LABELS[type]}
          </button>
        ))}
      </div>

      {/* 種別ごとに必要な項目だけ出す（画面定義書02 §4 と同じ構成） */}
      {choice.recurrenceType === "weekly" && (
        <div className="space-y-2">
          <div className="flex gap-1">
            {WEEKDAY_BITS.map(({ bit, label }) => (
              <button
                key={bit}
                type="button"
                onClick={() =>
                  setChoice((c) => ({ ...c, weekdays: toggleWeekday(c.weekdays ?? 0, bit) }))
                }
                aria-pressed={((choice.weekdays ?? 0) & (1 << bit)) !== 0}
                className={`h-6 w-6 rounded-control border text-xs ${
                  ((choice.weekdays ?? 0) & (1 << bit)) !== 0
                    ? "border-accent bg-accent-weak font-medium"
                    : "border-line hover:bg-accent-weak"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {/* 週間隔（隔週など。既定1=毎週。FB-44。詳細は画面定義書02 §4） */}
          <label className="flex items-center gap-2">
            <span className="text-ink-muted">週間隔</span>
            <input
              type="number"
              min={1}
              max={53}
              value={choice.weekInterval ?? 1}
              onChange={(e) => setChoice((c) => ({ ...c, weekInterval: Number(e.target.value) }))}
              className={`w-14 ${inputBase}`}
            />
            <span className="text-xs text-ink-muted">週おき（1=毎週）</span>
          </label>
        </div>
      )}

      {choice.recurrenceType === "monthly" && (
        <label className="flex items-center gap-2">
          <span className="text-ink-muted">日</span>
          <input
            type="number"
            min={1}
            max={31}
            value={choice.monthDay ?? 1}
            onChange={(e) => setChoice((c) => ({ ...c, monthDay: Number(e.target.value) }))}
            className={`w-16 ${inputBase}`}
          />
          <span className="text-xs text-ink-muted">月末超過は月末に丸めます</span>
        </label>
      )}

      {choice.recurrenceType === "interval" && (
        <label className="flex items-center gap-2">
          <input
            type="number"
            min={1}
            value={choice.intervalDays ?? 2}
            onChange={(e) => setChoice((c) => ({ ...c, intervalDays: Number(e.target.value) }))}
            className={`w-16 ${inputBase}`}
          />
          <span className="text-ink-muted">日ごと</span>
        </label>
      )}

      <label className="flex items-center gap-2">
        <span className="text-ink-muted">開始想定</span>
        <input
          value={choice.scheduledStartTime}
          onChange={(e) => setChoice((c) => ({ ...c, scheduledStartTime: e.target.value }))}
          // 区切りなし入力（0805）も受け付けるため、離れた時点で HH:MM へ整形する（§4.1・F-203）
          onBlur={() => setChoice((c) => ({ ...c, scheduledStartTime: normalized(c) }))}
          className={`w-20 font-mono tabular-nums ${inputBase}`}
        />
        {derivedSection !== undefined && (
          <span className="text-xs text-ink-muted">({derivedSection.name})</span>
        )}
      </label>

      {timeError !== null && <p className="text-xs text-danger">{timeError}</p>}

      <div className="flex items-center justify-between pt-1">
        {/* 元タスクは今日のリストに既にあるため、展開は翌日から（§4.1） */}
        <span className="text-xs text-ink-muted">明日から展開</span>
        <button type="button" onClick={submit} className={btnPrimary}>
          作成
        </button>
      </div>
    </div>
  );
}
