"use client";

import Link from "next/link";
import { addDays } from "@/domain/shared/logical-date";
import { ChevronLeftIcon, ChevronRightIcon } from "@/app/_components/icons";
import { formatLogicalDate } from "@/app/_lib/format";
import { btnPrimary, btnSecondary } from "@/app/_lib/ui";

type Props = Readonly<{
  date: string;
  weekday: number;
  isToday: boolean;
}>;

// 画面定義書01 §3.1: 前日/翌日/今日への移動。今日以外を表示中は背景色を変えて注意喚起する
export function DateNav({ date, weekday, isToday }: Props) {
  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/?date=${addDays(date, -1)}`}
        aria-label="前日"
        className={`inline-flex items-center self-stretch ${btnSecondary}`}
      >
        <ChevronLeftIcon className="h-3 w-3" />
      </Link>
      {/* 日付自体は表示日によらず同じ見た目（画面定義書01 §3.1） */}
      <span className="px-2 py-1 font-mono text-sm font-medium tabular-nums">
        {formatLogicalDate(date, weekday)}
      </span>
      <Link
        href={`/?date=${addDays(date, 1)}`}
        aria-label="翌日"
        className={`inline-flex items-center self-stretch ${btnSecondary}`}
      >
        <ChevronRightIcon className="h-3 w-3" />
      </Link>
      {/* 今日以外を表示中は「今日」ボタンを強調色で出し、戻る導線として注意喚起する（§3.1） */}
      {!isToday && (
        <Link href="/" className={btnPrimary}>
          今日
        </Link>
      )}
    </div>
  );
}
