ALTER TABLE "sap_transaction" ADD COLUMN "raw" jsonb DEFAULT '{}'::jsonb NOT NULL;
