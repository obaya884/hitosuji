// テスト用のインメモリ TaskRepository。
// 古典学派の「本物と同じ契約を満たす偽物」であってモックではない（アーキテクチャ定義書 §8）
import type {
  DuplicateAndStartCommand,
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

  /** section_id・sort_order のまとめ更新（自動セクション移動 F-113・打刻の取り消しの並べ直し） */
  const applyRelocations = (relocations: Relocations) => {
    for (const row of relocations) {
      const i = indexOf(row.taskId);
      rows[i] = { ...rows[i], sectionId: row.sectionId, sortOrder: row.sortOrder };
    }
  };

  /** sort_order のまとめ更新（中間値が尽きたときの振り直し。データモデル定義書 §3.5） */
  const applyRenumber = (renumber: Renumber) => {
    for (const row of renumber) {
      const i = indexOf(row.taskId);
      rows[i] = { ...rows[i], sortOrder: row.sortOrder };
    }
  };

  return {
    rows,
    skips,

    listByDate: async (date: LogicalDate) => rows.filter((r) => r.taskDate === date),

    findById: async (id: TaskId) => rows.find((r) => r.id === id) ?? null,

    findRunning: async () =>
      rows.find((r) => r.startedAt !== null && r.endedAt === null) ?? null,

    create: async (input: NewTask, renumber: Renumber) => {
      applyRenumber(renumber);
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
        applyRenumber(interruption.renumber);
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
      applyRelocations(command.relocations);
      const i = indexOf(taskId);
      rows[i] = { ...rows[i], startedAt };
    },

    updatePunch: async (
      id: TaskId,
      punch: Readonly<{ startedAt: Date; endedAt: Date | null }>,
      relocations: Relocations
    ) => {
      const i = indexOf(id);
      rows[i] = { ...rows[i], ...punch };
      // 開始時刻の修正に伴うセクション移動（§4.2-c）・完了の取り消しの復帰（§4.7）
      applyRelocations(relocations);
    },

    finish: async (id: TaskId, endedAt: Date) => {
      const i = indexOf(id);
      rows[i] = { ...rows[i], endedAt };
    },

    // 開始打刻の取り消し（F-210）。started_at を null に戻し、並べ直しがあれば反映する
    undoStart: async (id: TaskId, relocations: Relocations) => {
      const i = indexOf(id);
      rows[i] = { ...rows[i], startedAt: null };
      applyRelocations(relocations);
    },

    // 完了の取り消し（F-212）。started_at・ended_at をともに null に戻す
    undoComplete: async (id: TaskId, relocations: Relocations) => {
      const i = indexOf(id);
      rows[i] = { ...rows[i], startedAt: null, endedAt: null };
      applyRelocations(relocations);
    },

    // 複製して開始（F-208 / §4.6）。割り込みなら終了・再開タスク生成も伴う
    duplicateAndStart: async (command: DuplicateAndStartCommand) => {
      const { newTask, startedAt, interruption } = command;
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
      const created: Task = {
        id: nextId++,
        splitParentId: null,
        ...newTask,
        startedAt,
        endedAt: null,
        comment: null,
        routineId: null,
        postponedCount: 0,
      };
      rows.push(created);
      return created;
    },

    suspend: async (command: SuspendCommand) => {
      applyRenumber(command.renumber);
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
      applyRenumber(command.renumber);
      const i = indexOf(command.taskId);
      rows[i] = { ...rows[i], sectionId: command.sectionId, sortOrder: command.sortOrder };
    },

    relocate: async (relocations: Relocations) => {
      applyRelocations(relocations);
    },
  };
}
