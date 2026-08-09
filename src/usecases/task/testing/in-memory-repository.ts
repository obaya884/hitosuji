// テスト用のインメモリ TaskRepository。
// 古典学派の「本物と同じ契約を満たす偽物」であってモックではない（テスト戦略定義書 §2）
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
import type { ModeId } from "@/domain/mode/mode";
import type { ProjectId } from "@/domain/project/project";
import type { LogicalDate } from "@/domain/shared/logical-date";
import type { Task, TaskId } from "@/domain/task/task";

export type InMemoryTaskRepository = TaskRepository & {
  readonly rows: Task[];
  /** 記録されたルーチンスキップ（F-301 の検証用） */
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

  /**
   * 1行の書き換え。**対象が無ければ何もしない**——本物の `UPDATE ... WHERE id = ?` が0行で
   * 静かに終わるのと契約を揃える（存在の検査はユースケース側の責務で、`findById` で行う。
   * 画面定義書00_共通 §4.1）。揃えないと、存在しない id を渡したテストが偽物の側では
   * `rows[-1]` に書いて静かに通り、**本物なら失敗する経路がテストでは緑になる**
   */
  const patch = (id: TaskId, changes: Partial<Task>) => {
    const i = indexOf(id);
    if (i !== -1) rows[i] = { ...rows[i], ...changes };
  };

  /**
   * その日のスキップを記録する（削除 O-8・先送り O-7）。**同じ日は1件**——本物の
   * `ON CONFLICT DO NOTHING`（uq_routine_skips）と契約を揃える。**対象の行が無くても記録する**のも
   * 本物と同じ（記録は別テーブルへの INSERT で、tasks が0行更新かどうかに左右されない）
   */
  const recordSkip = (skip: RoutineSkip | null) => {
    if (skip !== null && !skips.some((s) => sameSkip(s, skip))) skips.push(skip);
  };

  /** section_id・sort_order のまとめ更新（自動セクション移動 F-113・打刻の取り消しの並べ直し） */
  const applyRelocations = (relocations: Relocations) => {
    for (const row of relocations) {
      patch(row.taskId, { sectionId: row.sectionId, sortOrder: row.sortOrder });
    }
  };

  /** sort_order のまとめ更新（中間値が尽きたときの振り直し。データモデル定義書 §3.5） */
  const applyRenumber = (renumber: Renumber) => {
    for (const row of renumber) patch(row.taskId, { sortOrder: row.sortOrder });
  };

  /**
   * NewTask を1行として追加する。**本物の INSERT が既定値で埋める列をここで埋める**——
   * `highlighted` は省略時 false（データモデル定義書 §3.5 の DEFAULT false と契約を揃える）。
   * 追加の経路（新規・再開タスク・複製）はすべてここを通す。**`restore` は通さない**——
   * あちらは削除前の行をそのまま戻す契約で、`comment`・`routineId`・`postponedCount` を
   * 既定値で潰してはいけない
   */
  const insertRow = (input: NewTask, startedAt: Date | null = null): Task => {
    const created: Task = {
      id: nextId++,
      splitParentId: null,
      ...input,
      highlighted: input.highlighted ?? false,
      startedAt,
      endedAt: null,
      comment: null,
      routineId: null,
      postponedCount: 0,
    };
    rows.push(created);
    return created;
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
      return insertRow(input);
    },

    rename: async (id: TaskId, name: string) => patch(id, { name }),

    updateEstimate: async (id: TaskId, estimateMinutes: number) =>
      patch(id, { estimateMinutes }),

    updateComment: async (id: TaskId, comment: string | null) => patch(id, { comment }),

    updateHighlight: async (id: TaskId, highlighted: boolean) => patch(id, { highlighted }),

    start: async (command: StartCommand) => {
      const { taskId, startedAt, interruption } = command;
      // 自動セクション移動（F-113 / 画面定義書01 §4.2-a）は打刻と同じ操作の中で反映する。
      // **移動 → 振り直しの順は本物と揃える**——振り直しは移動後の並びから計算されるので、
      // 逆順にすると移動が振り直しを上書きし、偽物だけ別の並びになる
      applyRelocations(command.relocations);
      if (interruption !== null) {
        applyRenumber(interruption.renumber);
        patch(interruption.runningTaskId, { endedAt: interruption.endedAt });
        insertRow(interruption.resumeTask);
      }
      patch(taskId, { startedAt });
    },

    updatePunch: async (
      id: TaskId,
      punch: Readonly<{ startedAt: Date; endedAt: Date | null }>,
      relocations: Relocations
    ) => {
      patch(id, punch);
      // 開始時刻の修正に伴うセクション移動（画面定義書01 §4.2-c）・完了の取り消しの復帰（データモデル定義書 §4.7）
      applyRelocations(relocations);
    },

    finish: async (id: TaskId, endedAt: Date) => patch(id, { endedAt }),

    // 開始打刻の取り消し（F-210）。started_at を null に戻し、並べ直しがあれば反映する
    undoStart: async (id: TaskId, relocations: Relocations) => {
      patch(id, { startedAt: null });
      applyRelocations(relocations);
    },

    // 完了の取り消し（F-212）。started_at・ended_at をともに null に戻す
    undoComplete: async (id: TaskId, relocations: Relocations) => {
      patch(id, { startedAt: null, endedAt: null });
      applyRelocations(relocations);
    },

    // 複製して開始（F-208 / データモデル定義書 §4.6）。割り込みなら終了・再開タスク生成も伴う
    duplicateAndStart: async (command: DuplicateAndStartCommand) => {
      const { newTask, startedAt, interruption } = command;
      // 振り直しは挿入位置を空ける処理なので、本物と同じくどの挿入よりも先に当てる（§3.5）
      applyRenumber(command.renumber);
      if (interruption !== null) patch(interruption.runningTaskId, { endedAt: interruption.endedAt });
      // **複製 → 再開タスクの順に挿入する**（本物と同じ順。逆にすると id の採番順が入れ替わる）
      const created = insertRow(newTask, startedAt);
      if (interruption !== null) insertRow(interruption.resumeTask);
      return created;
    },

    suspend: async (command: SuspendCommand) => {
      applyRenumber(command.renumber);
      patch(command.taskId, { endedAt: command.endedAt });
      insertRow(command.resumeTask);
    },

    delete: async (id: TaskId, skip: RoutineSkip | null) => {
      // 対象が無ければ何も消さない（`splice(-1, 1)` は末尾の行を消してしまう）
      const i = indexOf(id);
      if (i !== -1) rows.splice(i, 1);
      recordSkip(skip);
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

    postpone: async (id: TaskId, input, skip: RoutineSkip | null) => {
      // 加算があるので現在値が要る（他と違い patch だけでは書けない）
      const target = rows.find((r) => r.id === id);
      if (target !== undefined) {
        patch(id, {
          taskDate: input.taskDate,
          sortOrder: input.sortOrder,
          routineId: null,
          postponedCount: target.postponedCount + 1,
        });
      }
      recordSkip(skip);
    },

    updateClassification: async (
      id: TaskId,
      classification: Readonly<{ modeId?: ModeId | null; projectId?: ProjectId | null }>
    ) => patch(id, classification),

    move: async (command: MoveCommand) => {
      applyRenumber(command.renumber);
      patch(command.taskId, { sectionId: command.sectionId, sortOrder: command.sortOrder });
    },

    relocate: async (relocations: Relocations) => {
      applyRelocations(relocations);
    },
  };
}
