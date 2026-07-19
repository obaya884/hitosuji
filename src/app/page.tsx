import { listDailyList } from "@/application/task/daily-list-usecases";
import { isValidLogicalDate } from "@/domain/shared/logical-date";
import { createModeRepository } from "@/infrastructure/db/repositories/drizzle-mode-repository";
import { createProjectRepository } from "@/infrastructure/db/repositories/drizzle-project-repository";
import { createSectionRepository } from "@/infrastructure/db/repositories/drizzle-section-repository";
import { createTaskRepository } from "@/infrastructure/db/repositories/drizzle-task-repository";
import { DailyBoard } from "./_components/daily-board";
import { todayLogicalDate } from "./_lib/format";

export const dynamic = "force-dynamic";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
const deps = {
  tasks: createTaskRepository(),
  sections: createSectionRepository(),
  modes: createModeRepository(),
  projects: createProjectRepository(),
};

export default async function Home({
  searchParams,
}: Readonly<{ searchParams: Promise<{ date?: string }> }>) {
  const today = todayLogicalDate();
  const requested = (await searchParams).date;
  const date = requested !== undefined && isValidLogicalDate(requested) ? requested : today;

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
      />
    </>
  );
}
