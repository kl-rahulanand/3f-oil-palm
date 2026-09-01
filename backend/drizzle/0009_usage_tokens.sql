ALTER TABLE "audit_events" ADD COLUMN "model_id" text;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "input_tokens" integer;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "output_tokens" integer;
--> statement-breakpoint
ALTER TABLE "audit_events" ADD COLUMN "total_tokens" integer;
