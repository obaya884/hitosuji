"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { addDays, type LogicalDate } from "@/domain/shared/logical-date";
import { ChevronLeftIcon, ChevronRightIcon } from "@/app/_components/icons";
import { DatePicker } from "@/app/_components/date-picker";
import { formatLogicalDate } from "@/app/_lib/format";
import { btnSecondary } from "@/app/_lib/ui";

type Props = Readonly<{
  date: string;
  weekday: number;
  isToday: boolean;
  /** 移動先の画面（S-01 は `/`、S-04 は `/review`）。表示日は画面ごとに独立に持つ（画面定義書04 §3.1） */
  basePath: string;
  /**
   * datepicker（F-117）を有効にする画面のみ渡す（S-01）。未指定なら日付は素の表示のまま。
   * today は日界考慮済み（F-116）で「今日」強調に使う。open/onOpenChange で開閉を持ち上げる。
   */
  picker?: Readonly<{
    today: LogicalDate;
    open: boolean;
    onOpenChange: (open: boolean) => void;
  }>;
}>;

// 画面定義書01 §3.1: 前日/翌日/今日への移動。S-04 でも同じ操作にする（画面定義書04 §3.1）。
// 「今日へ」は今日以外を表示中のみ表示し、通常の枠線ボタン（強調色なし）にする
// （2026-07-20 オーナー判断: 強調色だと「表示日＝今日」の状態表示に見えてしまい、
// 逆に誤認を招いていたため。ボタンの有無自体が今日以外であることを示す。FB-07）
export function DateNav({ date, weekday, isToday, basePath, picker }: Props) {
  const router = useRouter();
  const label = formatLogicalDate(date, weekday);

  return (
    <div className="flex items-center gap-2">
      <Link
        href={`${basePath}?date=${addDays(date, -1)}`}
        aria-label="前日"
        className={`inline-flex items-center self-stretch ${btnSecondary}`}
      >
        <ChevronLeftIcon className="h-3 w-3" />
      </Link>
      {/* 日付自体は表示日によらず同じ見た目（画面定義書01 §3.1）。
          datepicker 有効時はクリックで開くボタンにする（F-117） */}
      {picker !== undefined ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => picker.onOpenChange(!picker.open)}
            aria-haspopup="dialog"
            aria-expanded={picker.open}
            className="rounded-control px-2 py-1 font-mono text-sm font-medium tabular-nums hover:bg-accent-weak"
          >
            {label}
          </button>
          {picker.open && (
            <DatePicker
              date={date}
              today={picker.today}
              onSelect={(selected) => {
                picker.onOpenChange(false);
                if (selected !== date) router.push(`${basePath}?date=${selected}`);
              }}
              onClose={() => picker.onOpenChange(false)}
            />
          )}
        </div>
      ) : (
        <span className="px-2 py-1 font-mono text-sm font-medium tabular-nums">{label}</span>
      )}
      <Link
        href={`${basePath}?date=${addDays(date, 1)}`}
        aria-label="翌日"
        className={`inline-flex items-center self-stretch ${btnSecondary}`}
      >
        <ChevronRightIcon className="h-3 w-3" />
      </Link>
      {/* 今日以外を表示中のみ表示する。ボタンの有無自体が「今日以外」を示す（§3.1） */}
      {!isToday && (
        <Link href={basePath} className={btnSecondary}>
          今日へ
        </Link>
      )}
    </div>
  );
}
