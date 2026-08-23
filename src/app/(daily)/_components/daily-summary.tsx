"use client";

import { APP_TIME_ZONE } from "@/domain/shared/time-zone";
import type { DailyGroup } from "@/domain/task/daily-list";
import {
  formatProjectedEnd,
  isOverMidnight,
  projectedEndTime,
  remainingMinutes,
} from "@/domain/task/projection";
import { formatClock, formatDuration } from "@/app/_lib/format";
import { TaskProgress } from "./task-progress";

type Props = Readonly<{
  groups: readonly DailyGroup[];
  now: Date;
  /** 当日を表示しているときのみ表示する（画面定義書01 §3.1） */
  isToday: boolean;
  /** 日界（分）。終了予定の日またぎ判定・超過警告の起点（F-116） */
  dayStartMinutes: number;
}>;

/**
 * 終了予定時刻・現在時刻・残時間（F-104）と1日全体のタスク進捗（F-114）。
 * 毎分＋操作の都度、クライアントで再計算する（画面定義書01 §3.1）
 */
export function DailySummary({ groups, now, isToday, dayStartMinutes }: Props) {
  const tasks = groups.flatMap((g) => g.tasks);
  const remaining = remainingMinutes(tasks, now);
  const end = projectedEndTime(tasks, now);
  const overMidnight = isOverMidnight(end, now, APP_TIME_ZONE, dayStartMinutes);

  return (
    // 数値は主段（00_共通 §1.1）。日付ナビの直後に左寄せで並べる（§3.1）
    <div className="flex items-center gap-4 font-mono text-base tabular-nums">
      {/* 1日全体の進捗は表示日によらず出す（過去日の振り返りでも見たいため。§3.1） */}
      <span className="flex items-center gap-2">
        <TaskProgress tasks={tasks} textSize="text-base" />
      </span>
      {/* 終了予定・現在・残作業は当日表示時のみ（§3.1） */}
      {isToday && (
        <>
          <span>
            <span className="font-sans text-sm text-ink-muted">終了予定 </span>
            <span className={overMidnight ? "font-medium text-danger" : "font-medium"}>
              {formatProjectedEnd(end, now, APP_TIME_ZONE, dayStartMinutes)}
            </span>
          </span>
          <span>
            <span className="font-sans text-sm text-ink-muted">現在 </span>
            {formatClock(now)}
          </span>
          {/* 「残」だけだと空き時間と誤読されるため「残作業」とする（§3.1 / FB-22） */}
          <span>
            <span className="font-sans text-sm text-ink-muted">残作業 </span>
            {formatDuration(remaining)}
          </span>
        </>
      )}
    </div>
  );
}
