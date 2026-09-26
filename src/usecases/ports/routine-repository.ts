import type { BundleId } from "@/domain/bundle/bundle";
import type { Routine, RoutineId } from "@/domain/routine/routine";
import type { ValidRoutineInput } from "@/domain/routine/input";
import type { RoutineTaskContent } from "@/domain/routine/task-content";
import type { SectionId } from "@/domain/section/section";
import type { LogicalDate } from "@/domain/shared/logical-date";

/**
 * 展開で生成するタスク（データモデル定義書 §4.1-3）。
 * ルーチンから写す内容は `RoutineTaskContent`（手動コピー F-307 と共通）で、
 * ここが足すのは**展開だけが決める4つ**——紐付け・日付・配置。
 * 写す項目を増やすときは `RoutineTaskContent` に足せば両方の経路に効く
 */
export type RoutineTaskSeed = RoutineTaskContent &
  Readonly<{
    routineId: RoutineId;
    taskDate: LogicalDate;
    sectionId: SectionId | null;
    sortOrder: number;
  }>;

export type RoutineRepository = Readonly<{
  listAll(): Promise<Routine[]>;
  findById(id: RoutineId): Promise<Routine | null>;
  create(input: ValidRoutineInput): Promise<Routine>;
  update(id: RoutineId, input: ValidRoutineInput): Promise<void>;
  setActive(id: RoutineId, isActive: boolean): Promise<void>;
  /** 削除しても展開済みタスクは routine_id を NULL にして残る（画面定義書02 O-4） */
  delete(id: RoutineId): Promise<void>;
  /** バンドルの出し入れ（画面定義書05 O-5 / O-6）。null で外す */
  setBundle(id: RoutineId, bundleId: BundleId | null): Promise<void>;
  /**
   * 展開タスクを冪等に INSERT する（F-301）。
   * `ON CONFLICT (routine_id, task_date) DO NOTHING` で既展開分は無視される
   */
  expand(seeds: readonly RoutineTaskSeed[]): Promise<number>;
  /** 指定日にスキップされているルーチン（F-301 / データモデル定義書 §3.6） */
  listSkippedOn(date: LogicalDate): Promise<RoutineId[]>;
}>;
