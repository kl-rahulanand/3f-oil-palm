DO $$
DECLARE
  active_actual numeric(18, 2);
  retained_actual numeric(18, 2);
  retained_rows integer;
BEGIN
  SELECT actual_net INTO active_actual
  FROM actual_by_key_month
  WHERE plant = 'DUB' AND cost_center = 'CC1' AND gl_code = '50001701' AND month = '2099-07-01';
  IF active_actual IS DISTINCT FROM 999.00::numeric(18, 2) THEN
    RAISE EXCEPTION 'expected switched actual_net 999.00, got %', active_actual;
  END IF;

  SELECT SUM(txn.debit - txn.credit), COUNT(*)
  INTO retained_actual, retained_rows
  FROM sap_transaction AS txn
  INNER JOIN ingest_batch AS batch ON batch.id = txn.batch_id
  WHERE batch.source_kind = 'actuals'
    AND batch.period = '2099-07-01'
    AND batch.uploaded_by = 'warehouse-proof'
    AND NOT batch.is_active;
  IF retained_actual IS DISTINCT FROM 110.25::numeric(18, 2) OR retained_rows <> 2 THEN
    RAISE EXCEPTION 'expected retained inactive rows totaling 110.25, got % across % rows',
      retained_actual, retained_rows;
  END IF;
END;
$$;
