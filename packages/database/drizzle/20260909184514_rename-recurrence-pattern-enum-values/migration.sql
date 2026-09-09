ALTER TABLE "notifications" ALTER COLUMN "recurrence_pattern" SET DATA TYPE text;--> statement-breakpoint
DROP TYPE "notification_recurrence_pattern";--> statement-breakpoint
CREATE TYPE "notification_recurrence_pattern" AS ENUM('hours', 'days', 'weeks');--> statement-breakpoint
ALTER TABLE "notifications" ALTER COLUMN "recurrence_pattern" SET DATA TYPE "notification_recurrence_pattern" USING "recurrence_pattern"::"notification_recurrence_pattern";