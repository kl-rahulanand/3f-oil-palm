CREATE SCHEMA "agent_financial";
--> statement-breakpoint
CREATE TABLE "agent_financial"."plant" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"source_aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" text NOT NULL,
	CONSTRAINT "plant_code_unique" UNIQUE("code")
);
--> statement-breakpoint
CREATE TABLE "agent_financial"."cost_center" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plant_id" uuid NOT NULL,
	"source_system" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"source_aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" text NOT NULL,
	CONSTRAINT "cost_center_source_plant_code_unique" UNIQUE("source_system", "plant_id", "code"),
	CONSTRAINT "cost_center_id_plant_unique" UNIQUE("id", "plant_id")
);
--> statement-breakpoint
CREATE TABLE "agent_financial"."gl_account" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_system" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"source_aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by_actor" text NOT NULL,
	CONSTRAINT "gl_account_source_code_unique" UNIQUE("source_system", "code")
);
--> statement-breakpoint
CREATE TABLE "agent_financial"."ingestion_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dataset_key" text NOT NULL,
	"source_system" text NOT NULL,
	"source_file_name" text NOT NULL,
	"source_checksum_sha256" text NOT NULL,
	"parser_version" text NOT NULL,
	"mapping_version" text NOT NULL,
	"budget_owner_plant_id" uuid,
	"state" text NOT NULL,
	"is_synthetic" boolean DEFAULT false NOT NULL,
	"source_reporting_months" date[] DEFAULT '{}'::date[] NOT NULL,
	"actual_coverage" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"budget_coverage" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_counts" jsonb NOT NULL,
	"validation_result" jsonb NOT NULL,
	"reconciliation_result" jsonb NOT NULL,
	"errors" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"source_modified_at_utc" timestamp with time zone,
	"imported_by_actor" text NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"validated_at_utc" timestamp with time zone,
	"activated_at_utc" timestamp with time zone,
	CONSTRAINT "ingestion_batch_state_check" CHECK ("state" IN ('staged', 'validated', 'active', 'superseded', 'failed')),
	CONSTRAINT "ingestion_batch_checksum_check" CHECK ("source_checksum_sha256" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "ingestion_batch_coverage_shape_check" CHECK (jsonb_typeof("actual_coverage") = 'array' AND jsonb_typeof("budget_coverage") = 'array'),
	CONSTRAINT "ingestion_batch_source_identity_unique" UNIQUE("dataset_key", "source_checksum_sha256", "parser_version", "mapping_version"),
	CONSTRAINT "ingestion_batch_id_budget_owner_unique" UNIQUE("id", "budget_owner_plant_id")
);
--> statement-breakpoint
CREATE TABLE "agent_financial"."nursery_budget_component" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"component_key" text NOT NULL,
	"parent_component_id" uuid,
	"s_no" text,
	"component_name" text NOT NULL,
	"depth" integer NOT NULL,
	"sort_order" integer NOT NULL,
	"is_leaf" boolean NOT NULL,
	"source_row_number" integer NOT NULL,
	"source_row" jsonb NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nursery_budget_component_depth_check" CHECK ("depth" >= 0),
	CONSTRAINT "nursery_budget_component_sort_order_check" CHECK ("sort_order" >= 0),
	CONSTRAINT "nursery_budget_component_not_self_parent_check" CHECK ("parent_component_id" IS NULL OR "parent_component_id" <> "id"),
	CONSTRAINT "nursery_budget_component_batch_id_unique" UNIQUE("batch_id", "id"),
	CONSTRAINT "nursery_budget_component_batch_key_unique" UNIQUE("batch_id", "component_key")
);
--> statement-breakpoint
CREATE TABLE "agent_financial"."financial_actual" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"source_system" text NOT NULL,
	"transaction_number" text NOT NULL,
	"line_id" text NOT NULL,
	"source_row_number" integer NOT NULL,
	"posting_date" date NOT NULL,
	"reporting_month" date GENERATED ALWAYS AS (date_trunc('month', "posting_date"::timestamp)::date) STORED NOT NULL,
	"section" text,
	"plant_id" uuid,
	"cost_center_id" uuid,
	"gl_account_id" uuid,
	"source_plant_code" text,
	"source_cost_center_code" text,
	"source_gl_code" text,
	"source_gl_name" text,
	"consideration" text,
	"short_name" text,
	"contra_account" text,
	"origin" text,
	"location" text,
	"debit" numeric(18, 2) NOT NULL,
	"credit" numeric(18, 2) NOT NULL,
	"actual_amount" numeric(18, 2) GENERATED ALWAYS AS ("debit" - "credit") STORED NOT NULL,
	"line_memo" text,
	"comment_1" text,
	"comment_2" text,
	"reference_1" text,
	"source_row" jsonb NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "financial_actual_cost_center_requires_plant_check" CHECK ("cost_center_id" IS NULL OR "plant_id" IS NOT NULL),
	CONSTRAINT "financial_actual_batch_source_line_unique" UNIQUE("batch_id", "transaction_number", "line_id")
);
--> statement-breakpoint
CREATE TABLE "agent_financial"."nursery_budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"budget_component_id" uuid NOT NULL,
	"reporting_month" date NOT NULL,
	"gl_account_id" uuid,
	"payment_office" text,
	"rollover_enabled" boolean NOT NULL,
	"budget_amount" numeric(18, 2) NOT NULL,
	"rollover_amount" numeric(18, 2) NOT NULL,
	"source_row_number" integer NOT NULL,
	"source_row" jsonb NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "nursery_budget_month_check" CHECK ("reporting_month" = date_trunc('month', "reporting_month")::date),
	CONSTRAINT "nursery_budget_batch_leaf_month_unique" UNIQUE("batch_id", "plant_id", "budget_component_id", "reporting_month")
);
--> statement-breakpoint
CREATE TABLE "agent_financial"."actual_budget_mapping" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mapping_version_id" uuid NOT NULL,
	"plant_id" uuid NOT NULL,
	"cost_center_id" uuid NOT NULL,
	"gl_account_id" uuid NOT NULL,
	"budget_component_key" text NOT NULL,
	"approval_status" text NOT NULL,
	"approval_reason" text,
	"approved_by" text NOT NULL,
	"provenance" jsonb NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "actual_budget_mapping_status_check" CHECK ("approval_status" IN ('approved', 'provisional')),
	CONSTRAINT "actual_budget_mapping_tuple_unique" UNIQUE("mapping_version_id", "plant_id", "cost_center_id", "gl_account_id")
);
--> statement-breakpoint
ALTER TABLE "agent_financial"."cost_center" ADD CONSTRAINT "cost_center_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "agent_financial"."plant"("id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."ingestion_batch" ADD CONSTRAINT "ingestion_batch_budget_owner_plant_id_plant_id_fk" FOREIGN KEY ("budget_owner_plant_id") REFERENCES "agent_financial"."plant"("id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."nursery_budget_component" ADD CONSTRAINT "nursery_budget_component_batch_id_ingestion_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "agent_financial"."ingestion_batch"("id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."nursery_budget_component" ADD CONSTRAINT "nursery_budget_component_parent_fk" FOREIGN KEY ("batch_id", "parent_component_id") REFERENCES "agent_financial"."nursery_budget_component"("batch_id", "id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."financial_actual" ADD CONSTRAINT "financial_actual_batch_id_ingestion_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "agent_financial"."ingestion_batch"("id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."financial_actual" ADD CONSTRAINT "financial_actual_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "agent_financial"."plant"("id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."financial_actual" ADD CONSTRAINT "financial_actual_gl_account_id_gl_account_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "agent_financial"."gl_account"("id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."financial_actual" ADD CONSTRAINT "financial_actual_cost_center_plant_fk" FOREIGN KEY ("cost_center_id", "plant_id") REFERENCES "agent_financial"."cost_center"("id", "plant_id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."nursery_budget" ADD CONSTRAINT "nursery_budget_batch_id_ingestion_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "agent_financial"."ingestion_batch"("id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."nursery_budget" ADD CONSTRAINT "nursery_budget_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "agent_financial"."plant"("id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."nursery_budget" ADD CONSTRAINT "nursery_budget_gl_account_id_gl_account_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "agent_financial"."gl_account"("id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."nursery_budget" ADD CONSTRAINT "nursery_budget_component_fk" FOREIGN KEY ("batch_id", "budget_component_id") REFERENCES "agent_financial"."nursery_budget_component"("batch_id", "id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."nursery_budget" ADD CONSTRAINT "nursery_budget_batch_owner_fk" FOREIGN KEY ("batch_id", "plant_id") REFERENCES "agent_financial"."ingestion_batch"("id", "budget_owner_plant_id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."actual_budget_mapping" ADD CONSTRAINT "actual_budget_mapping_version_id_ingestion_batch_id_fk" FOREIGN KEY ("mapping_version_id") REFERENCES "agent_financial"."ingestion_batch"("id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."actual_budget_mapping" ADD CONSTRAINT "actual_budget_mapping_plant_id_plant_id_fk" FOREIGN KEY ("plant_id") REFERENCES "agent_financial"."plant"("id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."actual_budget_mapping" ADD CONSTRAINT "actual_budget_mapping_gl_account_id_gl_account_id_fk" FOREIGN KEY ("gl_account_id") REFERENCES "agent_financial"."gl_account"("id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."actual_budget_mapping" ADD CONSTRAINT "actual_budget_mapping_cost_center_plant_fk" FOREIGN KEY ("cost_center_id", "plant_id") REFERENCES "agent_financial"."cost_center"("id", "plant_id");
--> statement-breakpoint
ALTER TABLE "agent_financial"."actual_budget_mapping" ADD CONSTRAINT "actual_budget_mapping_component_fk" FOREIGN KEY ("mapping_version_id", "budget_component_key") REFERENCES "agent_financial"."nursery_budget_component"("batch_id", "component_key");
--> statement-breakpoint
ALTER TABLE "agent_financial"."actual_budget_mapping" ADD CONSTRAINT "actual_budget_mapping_batch_owner_fk" FOREIGN KEY ("mapping_version_id", "plant_id") REFERENCES "agent_financial"."ingestion_batch"("id", "budget_owner_plant_id");
--> statement-breakpoint
CREATE INDEX "idx_cost_center_plant_id" ON "agent_financial"."cost_center" ("plant_id");
CREATE INDEX "idx_ingestion_batch_budget_owner_plant_id" ON "agent_financial"."ingestion_batch" ("budget_owner_plant_id");
CREATE UNIQUE INDEX "ingestion_batch_active_dataset_unique" ON "agent_financial"."ingestion_batch" ("dataset_key") WHERE "state" = 'active';
CREATE INDEX "idx_nursery_budget_component_batch_id" ON "agent_financial"."nursery_budget_component" ("batch_id");
CREATE INDEX "idx_nursery_budget_component_parent_id" ON "agent_financial"."nursery_budget_component" ("parent_component_id");
CREATE INDEX "idx_financial_actual_batch_id" ON "agent_financial"."financial_actual" ("batch_id");
CREATE INDEX "idx_financial_actual_plant_month" ON "agent_financial"."financial_actual" ("plant_id", "reporting_month");
CREATE INDEX "idx_financial_actual_gl_account_id" ON "agent_financial"."financial_actual" ("gl_account_id");
CREATE INDEX "idx_financial_actual_cost_center_id" ON "agent_financial"."financial_actual" ("cost_center_id");
CREATE INDEX "idx_nursery_budget_batch_id" ON "agent_financial"."nursery_budget" ("batch_id");
CREATE INDEX "idx_nursery_budget_plant_month" ON "agent_financial"."nursery_budget" ("plant_id", "reporting_month");
CREATE INDEX "idx_nursery_budget_gl_account_id" ON "agent_financial"."nursery_budget" ("gl_account_id");
CREATE INDEX "idx_nursery_budget_component_id" ON "agent_financial"."nursery_budget" ("budget_component_id");
CREATE INDEX "idx_actual_budget_mapping_component_key" ON "agent_financial"."actual_budget_mapping" ("mapping_version_id", "budget_component_key");
CREATE INDEX "idx_actual_budget_mapping_gl_account_id" ON "agent_financial"."actual_budget_mapping" ("gl_account_id");
--> statement-breakpoint
CREATE FUNCTION "agent_financial"."protect_source_row"() RETURNS trigger AS $$
BEGIN
	RAISE EXCEPTION 'agent_financial source rows are immutable';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER financial_actual_immutable BEFORE UPDATE OR DELETE ON "agent_financial"."financial_actual" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."protect_source_row"();
CREATE TRIGGER nursery_budget_immutable BEFORE UPDATE OR DELETE ON "agent_financial"."nursery_budget" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."protect_source_row"();
CREATE TRIGGER nursery_budget_component_immutable BEFORE UPDATE OR DELETE ON "agent_financial"."nursery_budget_component" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."protect_source_row"();
CREATE TRIGGER actual_budget_mapping_immutable BEFORE UPDATE OR DELETE ON "agent_financial"."actual_budget_mapping" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."protect_source_row"();
CREATE TRIGGER plant_immutable BEFORE UPDATE OR DELETE ON "agent_financial"."plant" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."protect_source_row"();
CREATE TRIGGER cost_center_immutable BEFORE UPDATE OR DELETE ON "agent_financial"."cost_center" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."protect_source_row"();
CREATE TRIGGER gl_account_immutable BEFORE UPDATE OR DELETE ON "agent_financial"."gl_account" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."protect_source_row"();
--> statement-breakpoint
CREATE FUNCTION "agent_financial"."require_staged_batch"() RETURNS trigger AS $$
DECLARE
	target_batch_id uuid;
	target_batch_state text;
BEGIN
	target_batch_id := (to_jsonb(NEW) ->> TG_ARGV[0])::uuid;
	SELECT b."state" INTO target_batch_state
	FROM "agent_financial"."ingestion_batch" b
	WHERE b."id" = target_batch_id
	FOR UPDATE;
	IF target_batch_state IS DISTINCT FROM 'staged' THEN
		RAISE EXCEPTION 'ingestion batch must remain staged while source rows are inserted';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER nursery_budget_component_batch_staged BEFORE INSERT ON "agent_financial"."nursery_budget_component" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."require_staged_batch"('batch_id');
CREATE TRIGGER financial_actual_batch_staged BEFORE INSERT ON "agent_financial"."financial_actual" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."require_staged_batch"('batch_id');
CREATE TRIGGER nursery_budget_batch_staged BEFORE INSERT ON "agent_financial"."nursery_budget" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."require_staged_batch"('batch_id');
CREATE TRIGGER actual_budget_mapping_batch_staged BEFORE INSERT ON "agent_financial"."actual_budget_mapping" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."require_staged_batch"('mapping_version_id');
--> statement-breakpoint
CREATE FUNCTION "agent_financial"."require_budget_leaf"() RETURNS trigger AS $$
BEGIN
	IF NOT EXISTS (
		SELECT 1 FROM "agent_financial"."nursery_budget_component" c
		WHERE c."batch_id" = NEW."batch_id" AND c."id" = NEW."budget_component_id" AND c."is_leaf"
	) THEN
		RAISE EXCEPTION 'nursery_budget facts must reference a leaf component';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER nursery_budget_leaf BEFORE INSERT OR UPDATE ON "agent_financial"."nursery_budget" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."require_budget_leaf"();
--> statement-breakpoint
CREATE FUNCTION "agent_financial"."validate_batch_metadata"() RETURNS trigger AS $$
DECLARE
	canonical_months date[];
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'ingestion_batch rows are immutable';
	END IF;
	SELECT COALESCE(array_agg(DISTINCT month ORDER BY month), '{}'::date[])
	INTO canonical_months FROM unnest(NEW."source_reporting_months") month;
	IF NEW."source_reporting_months" <> canonical_months OR EXISTS (
		SELECT 1 FROM unnest(NEW."source_reporting_months") month
		WHERE month <> date_trunc('month', month)::date
	) THEN
		RAISE EXCEPTION 'source_reporting_months must be sorted distinct month starts';
	END IF;
	IF TG_OP = 'UPDATE' AND OLD."state" <> NEW."state" AND NOT (
		(OLD."state" = 'staged' AND NEW."state" IN ('validated', 'failed')) OR
		(OLD."state" = 'validated' AND NEW."state" IN ('active', 'failed')) OR
		(OLD."state" = 'active' AND NEW."state" = 'superseded')
	) THEN
		RAISE EXCEPTION 'invalid ingestion_batch state transition';
	END IF;
	IF TG_OP = 'UPDATE' AND ROW(
		NEW."id", NEW."dataset_key", NEW."source_system", NEW."source_file_name",
		NEW."source_checksum_sha256", NEW."parser_version", NEW."mapping_version",
		NEW."budget_owner_plant_id", NEW."is_synthetic", NEW."source_modified_at_utc",
		NEW."imported_by_actor", NEW."created_at_utc"
	) IS DISTINCT FROM ROW(
		OLD."id", OLD."dataset_key", OLD."source_system", OLD."source_file_name",
		OLD."source_checksum_sha256", OLD."parser_version", OLD."mapping_version",
		OLD."budget_owner_plant_id", OLD."is_synthetic", OLD."source_modified_at_utc",
		OLD."imported_by_actor", OLD."created_at_utc"
	) THEN
		RAISE EXCEPTION 'ingestion_batch source identity is immutable';
	END IF;
	IF NEW."state" = 'active' AND NEW."activated_at_utc" IS NULL THEN
		RAISE EXCEPTION 'active ingestion_batch requires activated_at_utc';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ingestion_batch_metadata BEFORE INSERT OR UPDATE OR DELETE ON "agent_financial"."ingestion_batch" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."validate_batch_metadata"();
--> statement-breakpoint
CREATE FUNCTION "agent_financial"."protect_plant_alias"() RETURNS trigger AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "agent_financial"."plant" p WHERE p."id" <> NEW."id" AND
		(p."source_aliases" && NEW."source_aliases" OR p."code" = ANY(NEW."source_aliases") OR NEW."code" = ANY(p."source_aliases"))
	) THEN RAISE EXCEPTION 'plant aliases must resolve to one canonical target'; END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER plant_alias_unique BEFORE INSERT OR UPDATE ON "agent_financial"."plant" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."protect_plant_alias"();
--> statement-breakpoint
CREATE FUNCTION "agent_financial"."protect_cost_center_alias"() RETURNS trigger AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "agent_financial"."cost_center" c WHERE c."id" <> NEW."id"
		AND c."source_system" = NEW."source_system" AND c."plant_id" = NEW."plant_id" AND
		(c."source_aliases" && NEW."source_aliases" OR c."code" = ANY(NEW."source_aliases") OR NEW."code" = ANY(c."source_aliases"))
	) THEN RAISE EXCEPTION 'cost center aliases must resolve to one canonical target'; END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER cost_center_alias_unique BEFORE INSERT OR UPDATE ON "agent_financial"."cost_center" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."protect_cost_center_alias"();
--> statement-breakpoint
CREATE FUNCTION "agent_financial"."protect_gl_alias"() RETURNS trigger AS $$
BEGIN
	IF EXISTS (
		SELECT 1 FROM "agent_financial"."gl_account" g WHERE g."id" <> NEW."id"
		AND g."source_system" = NEW."source_system" AND
		(g."source_aliases" && NEW."source_aliases" OR g."code" = ANY(NEW."source_aliases") OR NEW."code" = ANY(g."source_aliases"))
	) THEN RAISE EXCEPTION 'GL aliases must resolve to one canonical target'; END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER gl_account_alias_unique BEFORE INSERT OR UPDATE ON "agent_financial"."gl_account" FOR EACH ROW EXECUTE FUNCTION "agent_financial"."protect_gl_alias"();
