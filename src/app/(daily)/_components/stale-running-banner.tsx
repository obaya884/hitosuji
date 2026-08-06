import Link from "next/link";
import { dateHref, DAILY_PATH } from "@/app/_lib/date-href";
import { formatClock, formatLogicalDate } from "@/app/_lib/format";
import { noticeDanger } from "@/app/_lib/ui";
import { weekdayIndex } from "@/domain/shared/logical-date";
import type { Task } from "@/domain/task/task";

type Props = Readonly<{ task: Task }>;

/**
 * 前日以前の実行中タスクの警告（画面定義書01 §8）。
 * 終了打刻の失念対策として、該当日へのリンクを添えてリスト上部に出す
 */
export function StaleRunningBanner({ task }: Props) {
  return (
    <div className={`mt-3 ${noticeDanger}`}>
      前日以前の実行中タスクがあります:{" "}
      <span className="font-medium">{task.name}</span>
      <span className="ml-2 font-mono text-xs tabular-nums">
        {formatLogicalDate(task.taskDate, weekdayIndex(task.taskDate))}
        {task.startedAt !== null && ` ${formatClock(task.startedAt)}〜`}
      </span>
      <Link href={dateHref(DAILY_PATH, task.taskDate)} className="ml-2 underline">
        該当日を開く
      </Link>
    </div>
  );
}
