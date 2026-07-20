import type { Task } from "@/domain/task/task";
import { taskProgress } from "@/domain/task/daily-list";

/**
 * タスク消化の進捗（F-114）。プログレスバー＋実施済み件数/全件数。
 * セクション見出し（§3.2）と画面上部のサマリ行（§3.1）で同じ見た目を使う
 */
export function TaskProgress({
  tasks,
  barWidth = "w-20",
  /** サマリ行（§3.1）は本文より1段階大きく、セクション見出し（§3.2）は補助表記のまま */
  textSize = "text-xs",
}: Readonly<{ tasks: readonly Task[]; barWidth?: string; textSize?: string }>) {
  const { done, total } = taskProgress(tasks);

  return (
    <>
      <span
        className={`h-1.5 ${barWidth} shrink-0 overflow-hidden rounded-control bg-line`}
        aria-hidden
      >
        <span
          className="block h-full bg-accent"
          style={{ width: total === 0 ? 0 : `${(done / total) * 100}%` }}
        />
      </span>
      <span className={`font-mono ${textSize} text-ink-muted tabular-nums`}>
        {done}/{total}
      </span>
    </>
  );
}
