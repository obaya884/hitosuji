ALTER TABLE "sections" ADD COLUMN "is_day_start" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sections_day_start_active" ON "sections" USING btree ("is_day_start") WHERE is_archived = false AND is_day_start = true;--> statement-breakpoint
-- 既存環境の日界を現状（0:00 固定）に合わせる（F-116）。深夜(00:00) の有効セクションがあれば日界にする。
-- 無ければ全て false のままとし、アプリ側のフォールバック（"00:00"）で従来の 0:00 固定挙動を保つ。
UPDATE "sections" SET "is_day_start" = true
WHERE "start_time" = '00:00:00' AND "is_archived" = false
  AND NOT EXISTS (
    SELECT 1 FROM "sections" WHERE "is_day_start" = true AND "is_archived" = false
  );