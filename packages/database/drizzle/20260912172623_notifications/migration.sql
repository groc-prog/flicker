CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(250) NOT NULL,
	"search_key" varchar(250),
	"genre" varchar,
	"min_vote_average" numeric(3,1),
	"ensure_performances_available" boolean,
	"recurrence_pattern" "notification_recurrence_pattern",
	"recurrence_interval" integer,
	"group_id" uuid,
	"next_trigger_at" timestamp(3) with time zone,
	"last_trigger_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_id_name_unique" UNIQUE("id","name"),
	CONSTRAINT "check_filters_set" CHECK ("search_key" IS NOT NULL OR "genre" IS NOT NULL OR "min_vote_average" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX "notifications_next_trigger_at_index" ON "notifications" ("next_trigger_at") WHERE ("next_trigger_at" is not null);--> statement-breakpoint
CREATE INDEX "idx_notification_name" ON "notifications" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_notification_key_trgm" ON "notifications" USING gin ("search_key" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "notifications_genre_index" ON "notifications" ("genre") WHERE ("genre" is not null);--> statement-breakpoint
CREATE INDEX "notifications_min_vote_average_index" ON "notifications" ("min_vote_average") WHERE ("min_vote_average" is not null);--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id");