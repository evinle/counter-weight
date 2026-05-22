CREATE TYPE "public"."event_type" AS ENUM('created', 'updated', 'rescheduled', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."priority" AS ENUM('low', 'medium', 'high', 'critical');--> statement-breakpoint
CREATE TYPE "public"."timer_status" AS ENUM('active', 'fired', 'completed', 'missed', 'cancelled');--> statement-breakpoint
CREATE TABLE "timer_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"timer_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"event_type" "event_type" NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb DEFAULT '{}'
);
--> statement-breakpoint
CREATE TABLE "timers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"group_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"emoji" text,
	"target_datetime" timestamp with time zone NOT NULL,
	"original_target_datetime" timestamp with time zone NOT NULL,
	"status" timer_status DEFAULT 'active' NOT NULL,
	"priority" "priority" DEFAULT 'medium' NOT NULL,
	"is_flagged" boolean DEFAULT false NOT NULL,
	"recurrence_rule" jsonb,
	"eventbridge_schedule_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"settings" jsonb DEFAULT '{}',
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timer_events" ADD CONSTRAINT "timer_events_timer_id_timers_id_fk" FOREIGN KEY ("timer_id") REFERENCES "public"."timers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_events" ADD CONSTRAINT "timer_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timers" ADD CONSTRAINT "timers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "timers_user_status_idx" ON "timers" USING btree ("user_id","status");--> statement-breakpoint
CREATE INDEX "timers_updated_at_idx" ON "timers" USING btree ("updated_at");