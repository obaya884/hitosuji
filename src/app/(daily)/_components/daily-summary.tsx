"use client";

import type { DailyGroup } from "@/domain/task/daily-list";
import {
  formatProjectedEnd,
  isOverMidnight,
  projectedEndTime,
  remainingMinutes,
} from "@/domain/task/projection";
import { formatDuration } from "@/app/_lib/format";

type Props = Readonly<{
  groups: readonly DailyGroup[];
  now: Date;
  /** 当日を表示しているときのみ表示する（画面定義書01 §3.1） */
  isToday: boolean;
}>;

/** 終了予定時刻と残時間（F-104）。毎分＋操作の都度、クライアントで再計算する */
export function DailySummary({ groups, now, isToday }: Props) {
  if (!isToday) return null;

  const tasks = groups.flatMap((g) => g.tasks);
  const remaining = remainingMinutes(tasks, now);
  const end = projectedEndTime(tasks, now);
  const overMidnight = isOverMidnight(end, now);

  return (
    <div className="flex items-baseline gap-4 font-mono text-sm tabular-nums">
      <span>
        <span className="font-sans text-xs text-ink-muted">終了予定 </span>
        <span className={overMidnight ? "font-medium text-danger" : "font-medium"}>
          {formatProjectedEnd(end, now)}
        </span>
      </span>
      <span>
        <span className="font-sans text-xs text-ink-muted">残 </span>
        {formatDuration(remaining)}
      </span>
    </div>
  );
}
