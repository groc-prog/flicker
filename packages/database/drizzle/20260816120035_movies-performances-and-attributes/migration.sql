CREATE TYPE "attribute_category" AS ENUM('fsk', 'seatClasses', 'technical', 'genres');--> statement-breakpoint
CREATE TYPE "movie_language" AS ENUM('de', 'en');--> statement-breakpoint
CREATE TABLE "attributes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"category" "attribute_category" NOT NULL,
	"name" text NOT NULL,
	"key" text NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "attributes_key_category_unique" UNIQUE("key","category")
);
--> statement-breakpoint
CREATE TABLE "movie_performances_to_attributes" (
	"performance_id" uuid,
	"attribute_id" uuid,
	CONSTRAINT "movie_performances_to_attributes_pkey" PRIMARY KEY("attribute_id","performance_id")
);
--> statement-breakpoint
CREATE TABLE "movie_performances" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"scraped_performance_id" text NOT NULL UNIQUE,
	"theatre" text NOT NULL,
	"seating_deep_link" text NOT NULL,
	"showtime" timestamp(3) with time zone NOT NULL,
	"scraped_movie_id" uuid NOT NULL,
	"movie_id" uuid,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "movies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"tmdb_id" integer,
	"language" "movie_language" NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"poster_path" text,
	"videos" jsonb,
	"homepage" text,
	"budget" integer,
	"revenue" integer,
	"adult" boolean,
	"original_language" text,
	"popularity" numeric,
	"runtime" integer,
	"vote_average" numeric(3,1),
	"vote_count" integer,
	"available_at" date NOT NULL,
	"scraped_movie_id" uuid NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "movies_language_scraped_movie_id_unique" UNIQUE("language","scraped_movie_id")
);
--> statement-breakpoint
CREATE TABLE "scraped_movies_to_attributes" (
	"scraped_movie_id" uuid,
	"attribute_id" uuid,
	CONSTRAINT "scraped_movies_to_attributes_pkey" PRIMARY KEY("attribute_id","scraped_movie_id")
);
--> statement-breakpoint
CREATE TABLE "scraped_movies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"scraped_movie_id" text NOT NULL UNIQUE,
	"title" text NOT NULL,
	"original_title" text,
	"description" text,
	"runtime" smallint,
	"poster_path" text,
	"available_at" date NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "attributes_category_id_index" ON "attributes" ("category","id");--> statement-breakpoint
CREATE INDEX "movie_performances_showtime_index" ON "movie_performances" ("showtime");--> statement-breakpoint
CREATE INDEX "movies_available_at_index" ON "movies" ("available_at");--> statement-breakpoint
CREATE INDEX "idx_movie_translations_language_title" ON "movies" USING gin ("language", "title" gin_trgm_ops);--> statement-breakpoint
ALTER TABLE "movie_performances_to_attributes" ADD CONSTRAINT "movie_performances_to_attributes_nL35VLZPTR9U_fkey" FOREIGN KEY ("performance_id") REFERENCES "movie_performances"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "movie_performances_to_attributes" ADD CONSTRAINT "movie_performances_to_attributes_C1r1YcUhgpNh_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "movie_performances" ADD CONSTRAINT "movie_performances_scraped_movie_id_scraped_movies_id_fkey" FOREIGN KEY ("scraped_movie_id") REFERENCES "scraped_movies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "movie_performances" ADD CONSTRAINT "movie_performances_movie_id_movies_id_fkey" FOREIGN KEY ("movie_id") REFERENCES "movies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "movies" ADD CONSTRAINT "movies_scraped_movie_id_scraped_movies_id_fkey" FOREIGN KEY ("scraped_movie_id") REFERENCES "scraped_movies"("id");--> statement-breakpoint
ALTER TABLE "scraped_movies_to_attributes" ADD CONSTRAINT "scraped_movies_to_attributes_dqlxIqVByInf_fkey" FOREIGN KEY ("scraped_movie_id") REFERENCES "scraped_movies"("id") ON DELETE CASCADE;--> statement-breakpoint
ALTER TABLE "scraped_movies_to_attributes" ADD CONSTRAINT "scraped_movies_to_attributes_attribute_id_attributes_id_fkey" FOREIGN KEY ("attribute_id") REFERENCES "attributes"("id") ON DELETE CASCADE;