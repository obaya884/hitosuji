import { listDailyReview } from "@/usecases/review/review-usecases";
import { isValidLogicalDate } from "@/domain/shared/logical-date";
import { createModeRepository } from "@/infrastructure/db/repositories/drizzle-mode-repository";
import { createProjectRepository } from "@/infrastructure/db/repositories/drizzle-project-repository";
import { createTaskRepository } from "@/infrastructure/db/repositories/drizzle-task-repository";
import { todayLogicalDate } from "@/app/_lib/format";
import { ReviewBoard } from "./_components/review-board";

export const dynamic = "force-dynamic";

// 合成ルート: リポジトリ実装をユースケースへ注入する（アーキテクチャ定義書 §3）
const deps = {
  tasks: createTaskRepository(),
  modes: createModeRepository(),
  projects: createProjectRepository(),
};

export default async function ReviewPage({
  searchParams,
}: Readonly<{ searchParams: Promise<{ date?: string }> }>) {
  const today = todayLogicalDate();
  const requested = (await searchParams).date;
  const date = requested !== undefined && isValidLogicalDate(requested) ? requested : today;

  // 読み取り専用の画面なので、ルーチン展開・繰り下げ（S-01 の表示時処理）は行わない（画面定義書04 §1）
  const view = await listDailyReview(deps, { date, today });

  return <ReviewBoard view={view} isToday={date === today} />;
}
