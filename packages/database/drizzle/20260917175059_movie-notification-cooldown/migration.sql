CREATE TABLE "movie_notification_cooldown" (
	"movie_id" uuid,
	"notification_id" uuid,
	"next_trigger_at" timestamp(3) with time zone,
	CONSTRAINT "movie_notification_cooldown_pkey" PRIMARY KEY("movie_id","notification_id")
);
--> statement-breakpoint
DROP INDEX "notifications_next_trigger_at_index";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "next_trigger_at";--> statement-breakpoint
ALTER TABLE "notifications" DROP COLUMN "last_trigger_at";--> statement-breakpoint
CREATE INDEX "movie_notification_cooldown_next_trigger_at_index" ON "movie_notification_cooldown" ("next_trigger_at") WHERE ("next_trigger_at" is not null);--> statement-breakpoint
ALTER TABLE "movie_notification_cooldown" ADD CONSTRAINT "movie_notification_cooldown_movie_id_movies_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "movie_notification_cooldown" ADD CONSTRAINT "movie_notification_cooldown_0dohGurAKZxl_fkey" FOREIGN KEY ("notification_id") REFERENCES "notifications"("id") ON DELETE CASCADE;