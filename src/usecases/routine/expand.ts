// ルーチン展開（F-301/302 / データモデル定義書 §4.1）
import type { RoutineRepository, RoutineTaskSeed } from "@/usecases/ports/routine-repository";
import type { SectionRepository } from "@/usecases/ports/section-repository";
import type { TaskRepository } from "@/usecases/ports/task-repository";
import { routinesToExpand } from "@/domain/routine/expansion";
import { routineTaskContent } from "@/domain/routine/task-content";
import { sectionAt, type SectionId } from "@/domain/section/section";
import type { LogicalDate } from "@/domain/shared/logical-date";
import { appendSortOrder } from "@/domain/task/sort-order";

export type ExpandDeps = Readonly<{
  routines: RoutineRepository;
  sections: SectionRepository;
  tasks: TaskRepository;
}>;

/**
 * 日付 D のルーチンを展開する（デイリーリスト表示のたびに呼ぶ）。
 * 生成タスクは開始想定時刻を含むセクションへ、そのセクション内の末尾に採番して置く。
 * INSERT は冪等なので、既に展開済みのルーチンは重複しない
 */
export async function expandRoutinesFor(
  deps: ExpandDeps,
  date: LogicalDate,
  today: LogicalDate
): Promise<number> {
  if (date < today) return 0; // 過去日は展開しない（§4.1-0）

  const [routines, sections, skipped] = await Promise.all([
    deps.routines.listAll(),
    deps.sections.listAll(),
    deps.routines.listSkippedOn(date),
  ]);

  // その日にスキップされたルーチンは展開しない（F-301 / データモデル定義書 §3.6）
  const targets = routinesToExpand(routines, date, today, skipped);
  if (targets.length === 0) return 0;

  const existing = await deps.tasks.listByDate(date);

  // セクションごとの末尾 sort_order を進めながら採番する（§4.1-3）
  const nextSortOrders = new Map<SectionId | null, number>();
  const seeds: RoutineTaskSeed[] = targets.map((routine) => {
    const section = sectionAt(sections, routine.scheduledStartTime);
    const sectionId = section?.id ?? null;

    const current = nextSortOrders.get(sectionId);
    const sortOrder =
      current ??
      appendSortOrder(
        existing.filter((t) => t.sectionId === sectionId).map((t) => t.sortOrder)
      );
    nextSortOrders.set(sectionId, sortOrder + 1000);

    return {
      ...routineTaskContent(routine), // 写す内容は手動コピー（F-307）と共通
      routineId: routine.id,
      taskDate: date,
      sectionId,
      sortOrder,
    };
  });

  return await deps.routines.expand(seeds);
}
