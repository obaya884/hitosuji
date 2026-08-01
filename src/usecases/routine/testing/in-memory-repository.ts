// テスト用のインメモリ RoutineRepository。
// 古典学派の「本物と同じ契約を満たす偽物」であってモックではない（テスト戦略定義書 §2）
import type { RoutineRepository, RoutineTaskSeed } from "@/usecases/ports/routine-repository";
import type { Routine, RoutineId } from "@/domain/routine/routine";
import type { ValidRoutineInput } from "@/domain/routine/input";
import type { LogicalDate } from "@/domain/shared/logical-date";

export type InMemoryRoutineRepository = RoutineRepository & {
  readonly rows: Routine[];
  /** 展開で投入されたタスクの種（F-301 の検証用） */
  readonly expanded: RoutineTaskSeed[];
  /** 特定日のスキップ（F-301 の検証用）。テストから直接積む */
  readonly skips: Array<{ routineId: RoutineId; taskDate: LogicalDate }>;
};

export function inMemoryRoutineRepository(
  initial: readonly Routine[] = []
): InMemoryRoutineRepository {
  const rows = [...initial];
  const expanded: RoutineTaskSeed[] = [];
  const skips: Array<{ routineId: RoutineId; taskDate: LogicalDate }> = [];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;

  const indexOf = (id: RoutineId) => rows.findIndex((r) => r.id === id);

  return {
    rows,
    expanded,
    skips,

    listAll: async () => [...rows],

    findById: async (id: RoutineId) => rows.find((r) => r.id === id) ?? null,

    create: async (input: ValidRoutineInput) => {
      const created: Routine = { id: nextId++, ...input, isActive: true };
      rows.push(created);
      return created;
    },

    update: async (id: RoutineId, input: ValidRoutineInput) => {
      const index = indexOf(id);
      if (index < 0) return;
      rows[index] = { ...rows[index], ...input };
    },

    setActive: async (id: RoutineId, isActive: boolean) => {
      const index = indexOf(id);
      if (index < 0) return;
      rows[index] = { ...rows[index], isActive };
    },

    delete: async (id: RoutineId) => {
      const index = indexOf(id);
      if (index >= 0) rows.splice(index, 1);
    },

    // 本物と同じく (routine_id, task_date) で冪等にする（データモデル定義書 §4.1）
    expand: async (seeds: readonly RoutineTaskSeed[]) => {
      const added = seeds.filter(
        (seed) =>
          !expanded.some((e) => e.routineId === seed.routineId && e.taskDate === seed.taskDate)
      );
      expanded.push(...added);
      return added.length;
    },

    listSkippedOn: async (date: LogicalDate) =>
      skips.filter((s) => s.taskDate === date).map((s) => s.routineId),
  };
}
