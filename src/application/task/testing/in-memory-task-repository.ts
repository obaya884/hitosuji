// テスト用のインメモリ TaskRepository。
// 古典学派の「本物と同じ契約を満たす偽物」であってモックではない（アーキテクチャ定義書 §8）
import type {
  MoveCommand,
  NewTask,
  StartCommand,
  SuspendCommand,
  TaskRepository,
} from "@/application/ports/task-repository";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task, TaskId } from "@/domain/task/task";

export type InMemoryTaskRepository = TaskRepository & { readonly rows: Task[] };

export function inMemoryTaskRepository(initial: readonly Task[] = []): InMemoryTaskRepository {
  const rows = [...initial];
  let nextId = Math.max(0, ...rows.map((r) => r.id)) + 1;

  const indexOf = (id: TaskId) => rows.findIndex((r) => r.id === id);

  return {
    rows,

    listByDate: async (date: LogicalDate) => rows.filter((r) => r.taskDate === date),

    findById: async (id: TaskId) => rows.find((r) => r.id === id) ?? null,

    findRunning: async () =>
      rows.find((r) => r.startedAt !== null && r.endedAt === null) ?? null,

    create: async (input: NewTask) => {
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
      const i = indexOf(taskId);
      rows[i] = { ...rows[i], startedAt };
    },

    updatePunch: async (
      id: TaskId,
      punch: Readonly<{ startedAt: Date; endedAt: Date | null }>
    ) => {
      const i = indexOf(id);
      rows[i] = { ...rows[i], ...punch };
    },

    finish: async (id: TaskId, endedAt: Date) => {
      const i = indexOf(id);
      rows[i] = { ...rows[i], endedAt };
    },

    suspend: async (command: SuspendCommand) => {
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

    delete: async (id: TaskId) => {
      rows.splice(indexOf(id), 1);
    },

    restore: async (restored) => {
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
  };
}
