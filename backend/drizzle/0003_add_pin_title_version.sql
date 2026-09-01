ALTER TABLE "dashboard_pins" ADD COLUMN "title" text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE "dashboard_pins" ADD COLUMN "definition_version" text;
