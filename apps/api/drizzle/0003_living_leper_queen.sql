CREATE TABLE "log_entries" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"day" integer NOT NULL,
	"raw_text" text NOT NULL,
	"revision" integer NOT NULL,
	"status" text NOT NULL,
	"kind" text,
	"result" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parse_traces" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"user_id" text NOT NULL,
	"request_id" text NOT NULL,
	"revision" integer NOT NULL,
	"model" text NOT NULL,
	"prompt_version" text NOT NULL,
	"input_text" text NOT NULL,
	"llm_cache_hit" integer NOT NULL,
	"usda_lookups" integer NOT NULL,
	"usda_cache_hits" integer NOT NULL,
	"llm_latency_ms" integer,
	"usda_latency_ms" integer,
	"total_latency_ms" integer NOT NULL,
	"prompt_tokens" integer,
	"completion_tokens" integer,
	"source" text,
	"confidence" real,
	"error_code" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "log_entries_user_day_idx" ON "log_entries" USING btree ("user_id","day");