import { expandRoutinesFor } from "@/usecases/routine/expand";
import { listDailyList } from "@/usecases/task/daily-list-usecases";
import { applyCarryOver } from "@/usecases/task/relocation-usecases";
import { isValidLogicalDate } from "@/domain/shared/logical-date";
import { createModeRepository } from "@/infrastructure/db/repositories/drizzle-mode-repository";
import { createProjectRepository } from "@/infrastructure/db/repositories/drizzle-project-repository";
import { createRoutineRepository } from "@/infrastructure/db/repositories/drizzle-routine-repository";
import { createSectionRepository } from "@/infrastructure/db/repositories/drizzle-section-repository";
import { createTaskRepository } from "@/infrastructure/db/repositories/drizzle-task-repository";
import { formatClock, todayLogicalDate } from "@/app/_lib/format";
import { DailyBoard } from "./_components/daily-board";

export const dynamic = "force-dynamic";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
const deps = {
  tasks: createTaskRepository(),
  sections: createSectionRepository(),
  modes: createModeRepository(),
  projects: createProjectRepository(),
  routines: createRoutineRepository(),
};

export default async function Home({
  searchParams,
}: Readonly<{ searchParams: Promise<{ date?: string }> }>) {
  const today = todayLogicalDate();
  const requested = (await searchParams).date;
  const date = requested !== undefined && isValidLogicalDate(requested) ? requested : today;

  // ルーチンは表示のたびにサーバで冪等展開する（F-301 / データモデル定義書 §4.1）。
  // 一覧取得より先に行い、展開直後の分も同じ表示に含める
  await expandRoutinesFor(deps, date, today);

  // やり残した未実行タスクを現在位置の直後へ繰り下げる（F-113 §4.2-b）。
  // 展開の後・一覧取得の前に行い、展開されたばかりのタスクも整列の対象にする
  await applyCarryOver(deps, { date, today, nowClock: formatClock(new Date()) });

  const view = await listDailyList(deps, date);

  return (
    <>
      <DailyBoard
        date={date}
        isToday={date === today}
        groups={view.groups}
        modes={view.modes}
        projects={view.projects}
        sections={view.sections}
        staleRunningTask={view.staleRunningTask}
      />
    </>
  );
}
