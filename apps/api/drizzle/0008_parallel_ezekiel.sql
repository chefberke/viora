ALTER TABLE "parse_trace_lookups" ADD COLUMN "unreachable" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "account_deletion_feedback" DROP COLUMN "email";