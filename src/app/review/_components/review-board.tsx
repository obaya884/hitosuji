"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import type { DailyReviewView } from "@/usecases/review/review-usecases";
import { addDays, weekdayIndex } from "@/domain/shared/logical-date";
import { estimateDiffMinutes, sharePercent, type ActualTotal } from "@/domain/task/review";
import { actualMinutes, type Task } from "@/domain/task/task";
import { DateNav } from "@/app/_components/date-nav";
import { UnsetMark } from "@/app/_components/unset-mark";
import { formatClock, formatDuration, formatEstimate } from "@/app/_lib/format";
import { isGlobalShortcutEvent } from "@/app/_lib/keyboard";
import { modeAppearance } from "@/app/_lib/mode-appearance";

/**
 * レビュー画面（S-04 / 画面定義書04）。読み取り専用のため更新操作を持たず、
 * 日付移動のショートカット（§5）のためだけにクライアントコンポーネントにする
 */
export function ReviewBoard({
  view,
  isToday,
}: Readonly<{ view: DailyReviewView; isToday: boolean }>) {
  const router = useRouter();
  const { date, log, totalMinutes, postponed, modeTotals, projectTotals, modes, projects } = view;

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      // IME変換中・修飾キー併用（使うのは Shift のみ）・テキスト入力中は操作として扱わない（00_共通 §3）
      if (!isGlobalShortcutEvent(e)) return;

      if (e.shiftKey) {
        if (e.key === "H") router.push(`/review?date=${addDays(date, -1)}`);
        if (e.key === "L") router.push(`/review?date=${addDays(date, 1)}`);
        return;
      }
      if (e.key === "t") router.push("/review");
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [date, router]);

  return (
    <>
      {/* 画面見出し（画面定義書00 §1） */}
      <h1 className="text-lg font-bold">レビュー</h1>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <DateNav
          date={date}
          weekday={weekdayIndex(date)}
          isToday={isToday}
          basePath="/review"
        />
        {/* サマリ（§3.2） */}
        <p className="text-sm tabular-nums">
          実行 {log.length}件
          <span className="ml-3">実績 {formatDuration(totalMinutes)}</span>
          {postponed !== null && <span className="ml-3">先送り {postponed.length}件</span>}
        </p>
      </div>

      <ExecutionLog log={log} date={date} modes={modes} projects={projects} />
      {postponed !== null && <Postponed tasks={postponed} />}

      {/* 集計は2表を横並びに（§3.5） */}
      <div className="mt-8 flex flex-wrap gap-x-12 gap-y-6">
        <ActualTotals
          heading="モード別集計"
          totals={modeTotals}
          totalMinutes={totalMinutes}
          nameOf={(id) => modes.find((m) => m.id === id)?.name}
        />
        <ActualTotals
          heading="プロジェクト別集計"
          totals={projectTotals}
          totalMinutes={totalMinutes}
          nameOf={(id) => projects.find((p) => p.id === id)?.name}
        />
      </div>
    </>
  );
}

/** 実績ログ（F-501 / §3.3） */
function ExecutionLog({
  log,
  date,
  modes,
  projects,
}: Readonly<{
  log: readonly Task[];
  date: string;
  modes: DailyReviewView["modes"];
  projects: DailyReviewView["projects"];
}>) {
  return (
    <section className="mt-6">
      <h2 className="text-sm font-medium">実績ログ</h2>
      {log.length === 0 ? (
        <p className="mt-3 text-sm text-ink-muted">実行したタスクはありません</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b border-line-strong text-left text-xs text-ink-muted">
              <th className="w-32 py-2 font-normal">時刻</th>
              <th className="py-2 font-normal">タスク名</th>
              <th className="w-28 py-2 font-normal">モード</th>
              <th className="w-32 py-2 font-normal">プロジェクト</th>
              <th className="w-16 py-2 pr-4 text-right font-normal">見積</th>
              <th className="w-16 py-2 pr-4 text-right font-normal">実績</th>
              <th className="w-16 py-2 text-right font-normal">差異</th>
            </tr>
          </thead>
          <tbody>
            {log.map((task) => (
              <LogRow
                key={task.id}
                task={task}
                date={date}
                modes={modes}
                projects={projects}
              />
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function LogRow({
  task,
  date,
  modes,
  projects,
}: Readonly<{
  task: Task;
  date: string;
  modes: DailyReviewView["modes"];
  projects: DailyReviewView["projects"];
}>) {
  const mode = modes.find((m) => m.id === task.modeId);
  const project = projects.find((p) => p.id === task.projectId);
  const actual = actualMinutes(task);
  const diff = estimateDiffMinutes(task);
  // モードから決まる見た目は S-01 と揃える（規則は `_lib/mode-appearance.ts`）
  const { dimmedClass, colorStyle } = modeAppearance(mode);

  return (
    // モード色は行全体のテキスト色に反映する（§2。S-01 と揃える）
    <tr className={`border-b border-line ${dimmedClass}`} style={colorStyle}>
      <td className="py-2 font-mono text-xs tabular-nums">
        {task.startedAt === null ? "--:--" : formatClock(task.startedAt)}-
        {task.endedAt === null ? "--:--" : formatClock(task.endedAt)}
      </td>
      <td className="py-2">
        {/* 修正は S-01 の過去日表示で行う（O-2 / §1）。モード色を消さないよう下線のみで示す */}
        <Link href={`/?date=${date}`} className="hover:underline">
          {task.name}
        </Link>
      </td>
      <td className="py-2 text-xs">{mode?.name ?? <UnsetMark />}</td>
      <td className="py-2 text-xs">{project?.name ?? <UnsetMark />}</td>
      {/* 見積もり未設定は薄色（画面定義書04 §3.3。S-01 と揃える） */}
      <td
        className={`py-2 pr-4 text-right font-mono tabular-nums ${
          task.estimateMinutes <= 0 ? "text-ink-faint" : ""
        }`}
      >
        {formatEstimate(task.estimateMinutes)}
      </td>
      <td className="py-2 pr-4 text-right font-mono tabular-nums">
        {actual === null ? "--:--" : formatDuration(actual)}
      </td>
      <td className={`py-2 text-right font-mono tabular-nums ${diff !== null && diff > 0 ? "text-danger" : ""}`}>
        {diff === null ? "" : `${diff > 0 ? "+" : "-"}${formatDuration(Math.abs(diff))}`}
      </td>
    </tr>
  );
}

/** 先送り（F-502 / §3.4）。件数だけでなく「何を先送りしたか」を並べる */
function Postponed({ tasks }: Readonly<{ tasks: readonly Task[] }>) {
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium">先送り（{tasks.length}件）</h2>
      {tasks.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">先送りはありません</p>
      ) : (
        <ul className="mt-2 space-y-1 text-sm">
          {tasks.map((task) => (
            <li key={task.id}>{task.name}</li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** モード別・プロジェクト別の実績集計（F-503 / §3.5） */
function ActualTotals({
  heading,
  totals,
  totalMinutes,
  nameOf,
}: Readonly<{
  heading: string;
  totals: readonly ActualTotal[];
  totalMinutes: number;
  nameOf: (id: number) => string | undefined;
}>) {
  return (
    <section className="min-w-64">
      <h2 className="text-sm font-medium">{heading}</h2>
      {totals.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">集計する実績がありません</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <tbody>
            {totals.map((row) => (
              <tr key={row.key ?? "none"} className="border-b border-line">
                <td className="py-2">
                  {row.key === null ? "（未設定）" : (nameOf(row.key) ?? "")}
                </td>
                <td className="w-16 py-2 pr-4 text-right font-mono tabular-nums">
                  {formatDuration(row.minutes)}
                </td>
                <td className="w-12 py-2 text-right font-mono tabular-nums text-ink-muted">
                  {sharePercent(row.minutes, totalMinutes)}%
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
