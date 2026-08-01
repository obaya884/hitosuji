import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  serial,
  text,
  time,
  timestamp,
  uniqueIndex,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

// 全テーブル共通カラム（データモデル定義書 §3）
// updated_at はアプリ層で更新時に設定する
const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
};

// §3.1 sections — 1日を区切る時間帯の枠。
// 並び順・終了時刻はカラムに持たず start_time から導出する（有効セクションは24時間を敷き詰める）
export const sections = pgTable(
  "sections",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    startTime: time("start_time").notNull(),
    isArchived: boolean("is_archived").notNull().default(false),
    // 日界セクション（1日の開始。F-116）。有効セクション内でちょうど1件が true
    isDayStart: boolean("is_day_start").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    // start_time の重複禁止は有効セクションのみに適用（アーカイブ済みとの重複は許す）
    uniqueIndex("uq_sections_start_time_active")
      .on(t.startTime)
      .where(sql`is_archived = false`),
    // 日界セクションは有効セクション内で最大1件（データモデル定義書 §3.1）
    uniqueIndex("uq_sections_day_start_active")
      .on(t.isDayStart)
      .where(sql`is_archived = false AND is_day_start = true`),
  ]
);

// §3.2 modes — 動作・活動の種類（色付き分類）
export const modes = pgTable("modes", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  isArchived: boolean("is_archived").notNull().default(false),
  ...timestamps,
});

// §3.3 projects — ゴールに向かうタスクのまとまり
export const projects = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  isArchived: boolean("is_archived").notNull().default(false),
  ...timestamps,
});

// §3.4 routines — 繰り返しルールでデイリーリストへ展開されるタスクの雛形
export const routines = pgTable(
  "routines",
  {
    id: serial("id").primaryKey(),
    name: text("name").notNull(),
    estimateMinutes: integer("estimate_minutes").notNull(),
    // 開始想定時刻。展開時の生成順と配置先セクションの導出に使う（予約時刻ではない）
    scheduledStartTime: time("scheduled_start_time").notNull(),
    modeId: integer("mode_id").references(() => modes.id),
    projectId: integer("project_id").references(() => projects.id),
    recurrenceType: text("recurrence_type").notNull(),
    weekdays: integer("weekdays"), // weekly用ビットマスク（bit0=月 … bit6=日）
    weekInterval: integer("week_interval"), // weekly用。n週おき（NULL/1=毎週）
    monthDay: integer("month_day"), // monthly用。月末超過は月末に丸め
    intervalDays: integer("interval_days"), // interval用。n日ごと
    startDate: date("start_date").notNull(), // interval の起算日を兼ねる
    endDate: date("end_date"),
    isActive: boolean("is_active").notNull().default(true),
    ...timestamps,
  },
  () => [
    check(
      "ck_routines_recurrence_type",
      sql`recurrence_type IN ('daily', 'weekly', 'monthly', 'interval')`
    ),
    check(
      "ck_routines_week_interval",
      sql`week_interval IS NULL OR (week_interval BETWEEN 1 AND 53)`
    ),
  ]
);

// §3.6 routine_skips — 特定日にそのルーチンを展開しない記録（F-301）。
// 展開されたタスクの削除で作られ、削除の取り消しで解除される
export const routineSkips = pgTable(
  "routine_skips",
  {
    id: serial("id").primaryKey(),
    routineId: integer("routine_id")
      .notNull()
      .references(() => routines.id, { onDelete: "cascade" }),
    taskDate: date("task_date").notNull(),
    ...timestamps,
  },
  (t) => [uniqueIndex("uq_routine_skips").on(t.routineId, t.taskDate)]
);

// §3.5 tasks — プランとログを兼ねる中心テーブル。状態カラムは持たず打刻から導出する
export const tasks = pgTable(
  "tasks",
  {
    id: serial("id").primaryKey(),
    taskDate: date("task_date").notNull(), // 保存された論理日付。打刻時刻から導出しない（日界の将来導入に備える）
    name: text("name").notNull(),
    estimateMinutes: integer("estimate_minutes").notNull().default(0), // 0 = 未設定扱い
    sectionId: integer("section_id").references(() => sections.id),
    modeId: integer("mode_id").references(() => modes.id),
    projectId: integer("project_id").references(() => projects.id),
    sortOrder: integer("sort_order").notNull(), // task_date ごとに独立した間隔採番（1000刻み）
    startedAt: timestamp("started_at", { withTimezone: true }),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    comment: text("comment"),
    highlighted: boolean("highlighted").notNull().default(false), // その日注力する印（F-118）
    routineId: integer("routine_id").references(() => routines.id, {
      onDelete: "set null", // ルーチン削除は展開済みタスクに影響しない（F-303）
    }),
    splitParentId: integer("split_parent_id").references(
      (): AnyPgColumn => tasks.id,
      { onDelete: "set null" }
    ),
    postponedCount: integer("postponed_count").notNull().default(0),
    ...timestamps,
  },
  (t) => [
    // ルーチン展開の冪等性（F-301）。INSERT 時は ON CONFLICT ... WHERE routine_id IS NOT NULL DO NOTHING を使う
    uniqueIndex("uq_tasks_routine_date")
      .on(t.routineId, t.taskDate)
      .where(sql`routine_id IS NOT NULL`),
    index("ix_tasks_date").on(t.taskDate),
    check(
      "ck_tasks_time",
      sql`ended_at IS NULL OR (started_at IS NOT NULL AND ended_at >= started_at)`
    ),
  ]
);
