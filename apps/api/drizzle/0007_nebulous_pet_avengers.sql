CREATE TABLE "entry_corrections" (
	"id" text PRIMARY KEY NOT NULL,
	"entry_id" text NOT NULL,
	"user_id" text NOT NULL,
	"trace_id" text,
	"revision" integer NOT NULL,
	"item_index" integer NOT NULL,
	"type" text NOT NULL,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "entry_corrections" ADD CONSTRAINT "entry_corrections_entry_id_log_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."log_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "entry_corrections" ADD CONSTRAINT "entry_corrections_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "entry_corrections_user_created_idx" ON "entry_corrections" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "entry_corrections_entry_idx" ON "entry_corrections" USING btree ("entry_id");--> statement-breakpoint
CREATE INDEX "parse_traces_user_created_idx" ON "parse_traces" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "parse_traces_error_code_idx" ON "parse_traces" USING btree ("error_code");