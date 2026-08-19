CREATE TABLE "saved_meals" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"text" text NOT NULL,
	"normalized_key" text NOT NULL,
	"status" text NOT NULL,
	"result" jsonb,
	"source_entry_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "saved_meals_user_key_unique" UNIQUE("user_id","normalized_key")
);
--> statement-breakpoint
ALTER TABLE "log_entries" ADD COLUMN "minute_of_day" integer;--> statement-breakpoint
ALTER TABLE "log_entries" ADD CONSTRAINT "log_entries_minute_of_day_check" CHECK ("minute_of_day" IS NULL OR ("minute_of_day" >= 0 AND "minute_of_day" < 1440));--> statement-breakpoint
ALTER TABLE "saved_meals" ADD CONSTRAINT "saved_meals_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "saved_meals_user_idx" ON "saved_meals" USING btree ("user_id");