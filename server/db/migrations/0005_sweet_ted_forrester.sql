ALTER TABLE "timers" ADD COLUMN "timer_type" text DEFAULT 'reminder' NOT NULL;--> statement-breakpoint
ALTER TABLE "timers" ADD COLUMN "lead_time_ms" integer;