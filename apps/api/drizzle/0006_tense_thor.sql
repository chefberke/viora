CREATE TABLE "parse_trace_lookups" (
	"trace_id" text NOT NULL,
	"provider" text NOT NULL,
	"lookups" integer NOT NULL,
	"cache_hits" integer NOT NULL,
	"skipped" integer NOT NULL,
	"latency_ms" integer,
	CONSTRAINT "parse_trace_lookups_trace_id_provider_pk" PRIMARY KEY("trace_id","provider")
);
--> statement-breakpoint
ALTER TABLE "parse_trace_lookups" ADD CONSTRAINT "parse_trace_lookups_trace_id_parse_traces_id_fk" FOREIGN KEY ("trace_id") REFERENCES "public"."parse_traces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parse_traces" DROP COLUMN "usda_lookups";--> statement-breakpoint
ALTER TABLE "parse_traces" DROP COLUMN "usda_cache_hits";--> statement-breakpoint
ALTER TABLE "parse_traces" DROP COLUMN "usda_latency_ms";