"use client";

import Link from "next/link";
import { addDays } from "@/domain/shared/logical-date";
import { formatLogicalDate } from "@/app/_lib/format";

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
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      >
        ◀
      </Link>
      {/* 日付自体は表示日によらず同じ見た目（画面定義書01 §3.1） */}
      <span className="rounded px-2 py-1 text-sm font-medium tabular-nums">
        {formatLogicalDate(date, weekday)}
      </span>
      <Link
        href={`/?date=${addDays(date, 1)}`}
        aria-label="翌日"
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      >
        ▶
      </Link>
      {/* 今日以外を表示中は「今日」ボタンを強調色で出し、戻る導線として注意喚起する（§3.1） */}
      {!isToday && (
        <Link
          href="/"
          className="rounded border border-blue-600 bg-blue-600 px-2 py-1 text-sm font-medium text-white"
        >
          今日
        </Link>
      )}
    </div>
  );
}
