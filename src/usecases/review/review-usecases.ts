// レビュー画面の表示ユースケース（S-04 / 画面定義書04 §3）
import type { ModeRepository } from "@/usecases/ports/mode-repository";
import type { ProjectRepository } from "@/usecases/ports/project-repository";
import type { TaskRepository } from "@/usecases/ports/task-repository";
import type { Mode } from "@/domain/mode/mode";
import type { Project } from "@/domain/project/project";
import type { LogicalDate } from "@/domain/shared/logical-date";
import {
  executionLog,
  postponedTasks,
  totalActualMinutes,
  totalActualMinutesBy,
  type ActualTotal,
} from "@/domain/task/review";
import type { StartedTask, Task } from "@/domain/task/task";

export type ReviewDeps = Readonly<{
  tasks: TaskRepository;
  modes: ModeRepository;
  projects: ProjectRepository;
}>;

export type DailyReviewView = Readonly<{
  date: LogicalDate;
  /** 実行済みタスクを開始時刻順に（§3.3） */
  log: readonly StartedTask[];
  totalMinutes: number;
  /** 先送りタスク（§3.4）。表示日が今日以降のときは確定していないため null */
  postponed: readonly Task[] | null;
  modeTotals: readonly ActualTotal[];
  projectTotals: readonly ActualTotal[];
  /** 行のモード色・集計行の名前に使う（アーカイブ済みも過去タスクから参照されるため含める） */
  modes: readonly Mode[];
  projects: readonly Project[];
}>;

export async function listDailyReview(
  deps: ReviewDeps,
  input: Readonly<{ date: LogicalDate; today: LogicalDate }>
): Promise<DailyReviewView> {
  // 今日以降はまだ実行されうるので先送りとして数えない（§3.4）。持ち越し先の取得もそのときだけ
  const isPast = input.date < input.today;
  const [tasks, carriedOver, modes, projects] = await Promise.all([
    deps.tasks.listByDate(input.date),
    isPast ? deps.tasks.listCarriedOverFrom(input.date) : [],
    deps.modes.listAll(),
    deps.projects.listAll(),
  ]);

  const log = executionLog(tasks);

  return {
    date: input.date,
    log,
    totalMinutes: totalActualMinutes(log),
    postponed: isPast ? postponedTasks(input.date, [...tasks, ...carriedOver]) : null,
    modeTotals: totalActualMinutesBy(log, (t) => t.modeId),
    projectTotals: totalActualMinutesBy(log, (t) => t.projectId),
    modes,
    projects,
  };
}
