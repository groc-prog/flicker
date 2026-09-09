CREATE TABLE "groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"discord_id" text NOT NULL UNIQUE,
	"discord_channel_id" text,
	"languages" jsonb DEFAULT '["en"]' NOT NULL,
	"tone" "bot_tone" DEFAULT 'normal'::"bot_tone" NOT NULL,
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
	"discord_id" text NOT NULL UNIQUE,
	"language" "movie_language",
	"tone" "bot_tone",
	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
);
