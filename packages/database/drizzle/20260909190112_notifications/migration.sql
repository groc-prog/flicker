CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"name" varchar(250) NOT NULL,
	"key" varchar(250) NOT NULL,
	"language" "movie_language",
	"recurrence_pattern" "notification_recurrence_pattern",
	"recurrence_interval" integer,
	"creator_id" uuid NOT NULL,
	"user_id" uuid,
	"group_id" uuid,
	"next_trigger_at" timestamp(3) with time zone,
	"last_trigger_at" timestamp(3) with time zone,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_id_name_unique" UNIQUE("id","name"),
	CONSTRAINT "receiver_defined_check" CHECK ("user_id" IS NOT NULL OR "group_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX "notifications_next_trigger_at_index" ON "notifications" ("next_trigger_at") WHERE ("next_trigger_at" is not null);--> statement-breakpoint
CREATE INDEX "idx_notification_name" ON "notifications" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "idx_notification_key_trgm" ON "notifications" USING gin ("key" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_creator_id_users_id_fkey" FOREIGN KEY ("creator_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id");--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_group_id_groups_id_fkey" FOREIGN KEY ("group_id") REFERENCES "groups"("id");