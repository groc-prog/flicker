ALTER TABLE "attributes" ADD COLUMN "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "movie_performances" ADD COLUMN "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "scraped_movies" ADD COLUMN "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL;