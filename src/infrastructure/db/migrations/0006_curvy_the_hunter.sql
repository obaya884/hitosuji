-- 既存行を埋めてから NOT NULL にする。先送りが翌日のみのあいだの値なので
-- task_date - postponed_count が最初に属した日と一致する（データモデル定義書 §3.5 / log_14 2026-09-21）
ALTER TABLE "tasks" ADD COLUMN "initial_task_date" date;--> statement-breakpoint
UPDATE "tasks" SET "initial_task_date" = "task_date" - "postponed_count";--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "initial_task_date" SET NOT NULL;
