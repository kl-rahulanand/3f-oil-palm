CREATE TABLE "ingest_batch" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_kind" text NOT NULL,
	"period" date NOT NULL,
	"uploaded_by" text NOT NULL,
	"uploaded_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"row_count" integer NOT NULL,
	"validation_result" jsonb NOT NULL,
	"reconciliation_result" jsonb NOT NULL,
	"is_active" boolean DEFAULT false NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ingest_batch_source_kind_check" CHECK ("ingest_batch"."source_kind" IN ('actuals', 'budget')),
	CONSTRAINT "ingest_batch_period_month_check" CHECK ("ingest_batch"."period" = date_trunc('month', "ingest_batch"."period")::date),
	CONSTRAINT "ingest_batch_row_count_check" CHECK ("ingest_batch"."row_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "mis_budget" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"format_id" text NOT NULL,
	"period" date NOT NULL,
	"line_id" text NOT NULL,
	"gl_code" text NOT NULL,
	"cost_center" text NOT NULL,
	"budget_amount" numeric(18, 2) NOT NULL,
	"rollover_amount" numeric(18, 2) NOT NULL,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mis_budget_batch_grain_unique" UNIQUE("batch_id","format_id","period","line_id","gl_code","cost_center"),
	CONSTRAINT "mis_budget_period_month_check" CHECK ("mis_budget"."period" = date_trunc('month', "mis_budget"."period")::date)
);
--> statement-breakpoint
CREATE TABLE "sap_transaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"txn_no" text NOT NULL,
	"line_id" text NOT NULL,
	"posting_date" date NOT NULL,
	"month" date NOT NULL,
	"plant" text NOT NULL,
	"plant_src" text NOT NULL,
	"cost_center" text NOT NULL,
	"gl_code" text NOT NULL,
	"acct_name" text NOT NULL,
	"contra_account" text,
	"debit" numeric(18, 2) NOT NULL,
	"credit" numeric(18, 2) NOT NULL,
	"memo" text,
	"reference" text,
	"created_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at_utc" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sap_transaction_batch_source_line_unique" UNIQUE("batch_id","txn_no","line_id"),
	CONSTRAINT "sap_transaction_month_check" CHECK ("sap_transaction"."month" = date_trunc('month', "sap_transaction"."month")::date)
);
--> statement-breakpoint
ALTER TABLE "mis_budget" ADD CONSTRAINT "mis_budget_batch_id_ingest_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ingest_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sap_transaction" ADD CONSTRAINT "sap_transaction_batch_id_ingest_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."ingest_batch"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ingest_batch_active_source_period_unique" ON "ingest_batch" USING btree ("source_kind","period") WHERE "ingest_batch"."is_active";--> statement-breakpoint
CREATE INDEX "idx_mis_budget_batch_id" ON "mis_budget" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_sap_transaction_batch_id" ON "sap_transaction" USING btree ("batch_id");--> statement-breakpoint
CREATE INDEX "idx_sap_transaction_month_plant_cost_center_gl_code" ON "sap_transaction" USING btree ("month","plant","cost_center","gl_code");--> statement-breakpoint
CREATE VIEW "public"."actual_by_key_month" AS (
  SELECT
    txn.plant,
    txn.cost_center,
    txn.gl_code,
    txn.month,
    SUM(txn.debit - txn.credit)::numeric(18, 2) AS actual_net
  FROM sap_transaction AS txn
  INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
  WHERE batch.source_kind = 'actuals' AND batch.is_active
  GROUP BY txn.plant, txn.cost_center, txn.gl_code, txn.month
);--> statement-breakpoint
CREATE FUNCTION protect_ingest_batch_metadata() RETURNS trigger AS $$
BEGIN
	IF TG_OP = 'DELETE' THEN
		RAISE EXCEPTION 'ingest_batch rows are immutable';
	END IF;

	IF ROW(NEW.id, NEW.source_kind, NEW.period, NEW.uploaded_by, NEW.uploaded_at_utc,
		NEW.row_count, NEW.validation_result, NEW.reconciliation_result, NEW.created_at_utc)
		IS DISTINCT FROM
		ROW(OLD.id, OLD.source_kind, OLD.period, OLD.uploaded_by, OLD.uploaded_at_utc,
		OLD.row_count, OLD.validation_result, OLD.reconciliation_result, OLD.created_at_utc) THEN
		RAISE EXCEPTION 'ingest_batch metadata is immutable';
	END IF;

	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER ingest_batch_immutable
BEFORE UPDATE OR DELETE ON ingest_batch
FOR EACH ROW EXECUTE FUNCTION protect_ingest_batch_metadata();
--> statement-breakpoint
CREATE FUNCTION enforce_sap_transaction_batch_period() RETURNS trigger AS $$
DECLARE
	batch_period date;
BEGIN
	SELECT period INTO batch_period FROM ingest_batch WHERE id = NEW.batch_id;
	IF batch_period IS DISTINCT FROM NEW.month THEN
		RAISE EXCEPTION 'sap_transaction month must match its ingest_batch period';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER sap_transaction_batch_period
BEFORE INSERT OR UPDATE ON sap_transaction
FOR EACH ROW EXECUTE FUNCTION enforce_sap_transaction_batch_period();
--> statement-breakpoint
CREATE FUNCTION enforce_mis_budget_batch_period() RETURNS trigger AS $$
DECLARE
	batch_period date;
BEGIN
	SELECT period INTO batch_period FROM ingest_batch WHERE id = NEW.batch_id;
	IF batch_period IS DISTINCT FROM NEW.period THEN
		RAISE EXCEPTION 'mis_budget period must match its ingest_batch period';
	END IF;
	RETURN NEW;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER mis_budget_batch_period
BEFORE INSERT OR UPDATE ON mis_budget
FOR EACH ROW EXECUTE FUNCTION enforce_mis_budget_batch_period();
