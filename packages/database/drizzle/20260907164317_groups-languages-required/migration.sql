ALTER TYPE "notification_recurrence_pattern" ADD VALUE 'unchanged' BEFORE 'hourly';--> statement-breakpoint
ALTER INDEX "idx_movie_translations_language_title" RENAME TO "idx_movie_language_title";--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "last_trigger_at" timestamp(3) with time zone;--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "is_recurring";--> statement-breakpoint
ALTER TABLE "groups" ALTER COLUMN "languages" SET NOT NULL;--> statement-breakpoint
CREATE INDEX "notifications_last_trigger_at_index" ON "notifications" ("last_trigger_at") WHERE ("last_trigger_at" is not null);