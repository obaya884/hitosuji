import Link from "next/link";
import { dateHref, DAILY_PATH } from "@/app/_lib/date-href";
import { formatLogicalDate } from "@/app/_lib/format";
import { STALE_UNSTARTED_WARNING } from "@/app/_lib/notice-messages";
import { noticeDanger } from "@/app/_lib/ui";
import { weekdayIndex } from "@/domain/shared/logical-date";
import type { UnstartedCountByDate } from "@/domain/task/task";

type Props = Readonly<{ counts: readonly UnstartedCountByDate[] }>;

/**
 * 前日以前の未実施タスクの警告（F-124 / 画面定義書01 §8）。
 * 日付ごとの件数を古い日から並べ、各日付を該当日へのリンクにする。
 * 片付けはその日のリスト上で行うので、バナー自身は操作を持たない。
 * 外側余白（`mt-3`）は置き場である板の律動に合わせた既定（§2）
 */
export function StaleUnstartedBanner({ counts }: Props) {
  return (
    <div className={`mt-3 ${noticeDanger}`}>
      {STALE_UNSTARTED_WARNING}:{" "}
      {counts.map(({ taskDate, count }, i) => (
        <span key={taskDate} className="font-mono text-meta tabular-nums">
          {i > 0 && <span className="mx-1.5">·</span>}
          <Link href={dateHref(DAILY_PATH, taskDate)} className="underline">
            {formatLogicalDate(taskDate, weekdayIndex(taskDate))}
          </Link>{" "}
          {count}件
        </span>
      ))}
    </div>
  );
}
