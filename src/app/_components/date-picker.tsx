"use client";

import { useEffect, useState } from "react";
import { addDays, type LogicalDate } from "@/domain/shared/logical-date";
import {
  dayOf,
  monthGrid,
  monthOf,
  shiftMonthKeepingDay,
  type WeekStart,
} from "@/domain/shared/month-grid";
import { ChevronLeftIcon, ChevronRightIcon } from "@/app/_components/icons";
import { floatPanel } from "@/app/_lib/ui";
import { useDismiss } from "@/app/_lib/use-dismiss";
import { useFlipUp } from "@/app/_lib/use-flip-up";

// 週の起点は月曜（画面定義書01 §3.1）。ヘッダも月始まりで並べる
const WEEK_START: WeekStart = 1;
const WEEKDAY_LABELS = ["月", "火", "水", "木", "金", "土", "日"] as const;

type Props = Readonly<{
  /** 現在の表示日。初期フォーカスと選択強調に使う */
  date: LogicalDate;
  /** 今日（日界考慮済み。F-116）。カレンダー内の「今日」強調に使う */
  today: LogicalDate;
  /** 日を確定したとき（その日を表示日にする）。閉じるのは呼び出し側 */
  onSelect: (date: LogicalDate) => void;
  onClose: () => void;
}>;

/**
 * 離れた日付へジャンプする datepicker（F-117 / 画面定義書01 §3.1）。
 * キーボード（矢印・H/J/K/L で日移動・Enter 確定・Esc 閉じる）と外側クリックで操作する。
 * カーソル（focused）を単一の真実とし、表示月はその日が属する月に追従する。
 */
export function DatePicker({ date, today, onSelect, onClose }: Props) {
  // 画面下部の行では上向きに開く（§7 / FB-21。選択ポップオーバーと同じ）
  const { ref, positionClass } = useFlipUp<HTMLDivElement>();
  // キーボードカーソル。開いたときは表示日に置く（§3.1）
  const [focused, setFocused] = useState<LogicalDate>(date);
  const view = monthOf(focused);
  // monthGrid は軽い純関数なので毎レンダー導出でよい（表示月はカーソルの属する月に追従する）
  const weeks = monthGrid(view, WEEK_START);

  // Escape は下のキーナビ effect が IME 判定込みで扱うため escape:false（選択ポップオーバーと同じ）
  useDismiss(ref, onClose, { escape: false });

  // キーボード操作（§3.1 / §6）。document で拾い、背後の行操作へ流さない（SelectPopover と同じ流儀）
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.isComposing) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const move = (days: number) => {
        e.preventDefault();
        e.stopPropagation();
        setFocused((d) => addDays(d, days));
      };
      switch (e.key) {
        case "Escape":
          onClose();
          return;
        case "ArrowLeft":
        case "h":
          move(-1);
          return;
        case "ArrowRight":
        case "l":
          move(1);
          return;
        case "ArrowDown":
        case "j":
          move(7);
          return;
        case "ArrowUp":
        case "k":
          move(-7);
          return;
        case "Enter":
          e.preventDefault();
          e.stopPropagation();
          onSelect(focused);
          return;
        default:
          return;
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [focused, onSelect, onClose]);

  return (
    <div
      ref={ref}
      className={`absolute left-0 z-10 w-64 p-3 ${positionClass} ${floatPanel}`}
    >
      {/* 月ヘッダ＋前月/翌月（年ジャンプは持たない。§3.1） */}
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          aria-label="前月"
          onClick={() => setFocused((d) => shiftMonthKeepingDay(d, -1))}
          className="rounded-control p-1 text-ink-muted hover:bg-accent-weak hover:text-ink"
        >
          <ChevronLeftIcon className="h-3 w-3" />
        </button>
        <span className="text-sm font-medium tabular-nums">
          {view.year}年 {view.month}月
        </span>
        <button
          type="button"
          aria-label="翌月"
          onClick={() => setFocused((d) => shiftMonthKeepingDay(d, 1))}
          className="rounded-control p-1 text-ink-muted hover:bg-accent-weak hover:text-ink"
        >
          <ChevronRightIcon className="h-3 w-3" />
        </button>
      </div>

      {/* 曜日ヘッダ（月曜始まり） */}
      <div className="grid grid-cols-7 text-center text-xs text-ink-faint">
        {WEEKDAY_LABELS.map((label) => (
          <span key={label} className="py-1">
            {label}
          </span>
        ))}
      </div>

      {/* 日セル */}
      <div className="grid grid-cols-7">
        {weeks.flat().map((cell) => {
          const inMonth = monthOf(cell).month === view.month;
          const isSelected = cell === date;
          const isToday = cell === today;
          const isFocused = cell === focused;
          const day = dayOf(cell);
          return (
            <button
              key={cell}
              type="button"
              aria-current={isSelected ? "date" : undefined}
              onClick={() => onSelect(cell)}
              className={`m-0.5 h-8 rounded-control text-sm tabular-nums hover:bg-accent-weak ${
                isSelected
                  ? "bg-accent font-medium text-white"
                  : isToday
                    ? "text-accent font-medium"
                    : inMonth
                      ? "text-ink"
                      : "text-ink-faint"
              } ${isFocused ? "ring-1 ring-accent" : ""}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
