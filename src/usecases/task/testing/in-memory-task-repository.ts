// テスト用のインメモリ TaskRepository。
// 古典学派の「本物と同じ契約を満たす偽物」であってモックではない（アーキテクチャ定義書 §8）
import type {
  MoveCommand,
  NewTask,
  Relocations,
  Renumber,
  RoutineSkip,
  StartCommand,
  SuspendCommand,
  TaskRepository,
} from "@/usecases/ports/task-repository";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task, TaskId } from "@/domain/task/task";

export type InMemoryTaskRepository = TaskRepository & {
  readonly rows: Task[];
  /** 記録されたルーチンスキップ（F-304 の検証用） */
  readonly skips: RoutineSkip[];
};

function sameSkip(a: RoutineSkip, b: RoutineSkip): boolean {
  return a.routineId === b.routineId && a.taskDate === b.taskDate;
}

export function inMemoryTaskRepository(initial: readonly Task[] = []): InMemoryTaskRepository {
  const rows = [...initial];
  const skips: RoutineSkip[] = [];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;

  const indexOf = (id: TaskId) => rows.findIndex((r) => r.id === id);

  return {
    rows,
    skips,

    listByDate: async (date: LogicalDate) => rows.filter((r) => r.taskDate === date),

    findById: async (id: TaskId) => rows.find((r) => r.id === id) ?? null,

    findRunning: async () =>
      rows.find((r) => r.startedAt !== null && r.endedAt === null) ?? null,

    create: async (input: NewTask, renumber?: Renumber | null) => {
      for (const row of renumber ?? []) {
        const i = indexOf(row.taskId);
        rows[i] = { ...rows[i], sortOrder: row.sortOrder };
      }
      const created: Task = {
        id: nextId++,
        splitParentId: null,
        ...input,
        startedAt: null,
        endedAt: null,
        comment: null,
        routineId: null,
        postponedCount: 0,
      };
      rows.push(created);
      return created;
    },

    rename: async (id: TaskId, name: string) => {
      const i = indexOf(id);
      rows[i] = { ...rows[i], name };
    },

    updateEstimate: async (id: TaskId, estimateMinutes: number) => {
      const i = indexOf(id);
      rows[i] = { ...rows[i], estimateMinutes };
    },

    start: async (command: StartCommand) => {
      const { taskId, startedAt, interruption } = command;
      if (interruption !== null) {
        for (const row of interruption.renumber ?? []) {
          const j = indexOf(row.taskId);
          rows[j] = { ...rows[j], sortOrder: row.sortOrder };
        }
        const running = indexOf(interruption.runningTaskId);
        rows[running] = { ...rows[running], endedAt: interruption.endedAt };
        rows.push({
          id: nextId++,
          splitParentId: null,
          ...interruption.resumeTask,
          startedAt: null,
          endedAt: null,
          comment: null,
          routineId: null,
          postponedCount: 0,
        });
      }
      // 自動セクション移動（F-113 §4.2-a）は打刻と同じ操作の中で反映する
      for (const row of command.relocation ?? []) {
        const j = indexOf(row.taskId);
        rows[j] = { ...rows[j], sectionId: row.sectionId, sortOrder: row.sortOrder };
      }
      const i = indexOf(taskId);
      rows[i] = { ...rows[i], startedAt };
    },

    updatePunch: async (
      id: TaskId,
      punch: Readonly<{ startedAt: Date; endedAt: Date | null }>,
      relocation?: Relocations | null
    ) => {
      const i = indexOf(id);
      rows[i] = { ...rows[i], ...punch };
      // 開始時刻の修正に伴うセクション移動（§4.2-c）
      for (const row of relocation ?? []) {
        const j = indexOf(row.taskId);
        rows[j] = { ...rows[j], sectionId: row.sectionId, sortOrder: row.sortOrder };
      }
    },

    finish: async (id: TaskId, endedAt: Date) => {
      const i = indexOf(id);
      rows[i] = { ...rows[i], endedAt };
    },

    suspend: async (command: SuspendCommand) => {
      for (const row of command.renumber ?? []) {
        const j = indexOf(row.taskId);
        rows[j] = { ...rows[j], sortOrder: row.sortOrder };
      }
      const i = indexOf(command.taskId);
      rows[i] = { ...rows[i], endedAt: command.endedAt };
      rows.push({
        id: nextId++,
        splitParentId: null,
        ...command.resumeTask,
        startedAt: null,
        endedAt: null,
        comment: null,
        routineId: null,
        postponedCount: 0,
      });
    },

    delete: async (id: TaskId, skip: RoutineSkip | null) => {
      rows.splice(indexOf(id), 1);
      if (skip !== null && !skips.some((s) => sameSkip(s, skip))) skips.push(skip);
    },

    restore: async (restored, skip: RoutineSkip | null) => {
      if (skip !== null) {
        const i = skips.findIndex((s) => sameSkip(s, skip));
        if (i !== -1) skips.splice(i, 1);
      }
      const created: Task = { id: nextId++, ...restored };
      rows.push(created);
      return created;
    },

    postpone: async (id: TaskId, input) => {
      const i = indexOf(id);
      rows[i] = {
        ...rows[i],
        taskDate: input.taskDate,
        sortOrder: input.sortOrder,
        postponedCount: rows[i].postponedCount + 1,
      };
    },

    updateClassification: async (
      id: TaskId,
      classification: Readonly<{ modeId?: number | null; projectId?: number | null }>
    ) => {
      const i = indexOf(id);
      rows[i] = { ...rows[i], ...classification };
    },

    move: async (command: MoveCommand) => {
      for (const { taskId, sortOrder } of command.renumber ?? []) {
        const i = indexOf(taskId);
        rows[i] = { ...rows[i], sortOrder };
      }
      const i = indexOf(command.taskId);
      rows[i] = { ...rows[i], sectionId: command.sectionId, sortOrder: command.sortOrder };
    },

    relocate: async (relocations: Relocations) => {
      for (const row of relocations) {
        const i = indexOf(row.taskId);
        rows[i] = { ...rows[i], sectionId: row.sectionId, sortOrder: row.sortOrder };
      }
    },
  };
}
