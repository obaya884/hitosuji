CREATE TABLE "modes" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"color" text NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "routines" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"estimate_minutes" integer NOT NULL,
	"scheduled_start_time" time NOT NULL,
	"mode_id" integer,
	"project_id" integer,
	"recurrence_type" text NOT NULL,
	"weekdays" integer,
	"month_day" integer,
	"interval_days" integer,
	"start_date" date NOT NULL,
	"end_date" date,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_routines_recurrence_type" CHECK (recurrence_type IN ('daily', 'weekly', 'monthly', 'interval'))
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"start_time" time NOT NULL,
	"is_archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" serial PRIMARY KEY NOT NULL,
	"task_date" date NOT NULL,
	"name" text NOT NULL,
	"estimate_minutes" integer DEFAULT 0 NOT NULL,
	"section_id" integer,
	"mode_id" integer,
	"project_id" integer,
	"sort_order" integer NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"comment" text,
	"routine_id" integer,
	"split_parent_id" integer,
	"postponed_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_tasks_time" CHECK (ended_at IS NULL OR (started_at IS NOT NULL AND ended_at >= started_at))
);
--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_mode_id_modes_id_fk" FOREIGN KEY ("mode_id") REFERENCES "public"."modes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "routines" ADD CONSTRAINT "routines_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_mode_id_modes_id_fk" FOREIGN KEY ("mode_id") REFERENCES "public"."modes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_routine_id_routines_id_fk" FOREIGN KEY ("routine_id") REFERENCES "public"."routines"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_split_parent_id_tasks_id_fk" FOREIGN KEY ("split_parent_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_sections_start_time_active" ON "sections" USING btree ("start_time") WHERE is_archived = false;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tasks_routine_date" ON "tasks" USING btree ("routine_id","task_date") WHERE routine_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_tasks_date" ON "tasks" USING btree ("task_date");