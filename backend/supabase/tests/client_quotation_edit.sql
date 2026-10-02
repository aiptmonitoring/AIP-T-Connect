-- Transaction-only regression: leaves no test records or business changes.
BEGIN;
DO $$
DECLARE source public.quotations; fixture public.quotations; payload jsonb; items jsonb; before_items jsonb; result jsonb;
BEGIN
 SELECT q.* INTO source FROM public.quotations q WHERE EXISTS (SELECT 1 FROM public.quotation_items i WHERE i.quotation_id=q.id) LIMIT 1;
 IF NOT FOUND THEN RAISE EXCEPTION 'Quotation fixture source unavailable'; END IF;
 fixture := jsonb_populate_record(source, jsonb_build_object('id',gen_random_uuid(),'reference_no','EDIT-REGRESSION-'||gen_random_uuid()::text,'status','Pending Approval','deleted_at',null,'invoice_verification_token',gen_random_uuid()::text));
 INSERT INTO public.quotations SELECT fixture.*;
 SELECT jsonb_agg(to_jsonb(i)-'id'-'quotation_id'-'created_at') INTO items FROM public.quotation_items i WHERE quotation_id=source.id;
 payload := to_jsonb(fixture) || jsonb_build_object('subject','Atomic editing regression','status','Approved','reference_no','SHOULD-NOT-CHANGE');
 result := public.edit_pending_client_quotation(fixture.id,fixture.client_id,payload,items);
 IF (SELECT status FROM public.quotations WHERE id=fixture.id) <> 'Pending Approval' OR result->>'reference_no' <> fixture.reference_no THEN RAISE EXCEPTION 'Protected fields changed'; END IF;
 SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) INTO before_items FROM public.quotation_items i WHERE quotation_id=fixture.id;
 BEGIN
  PERFORM public.edit_pending_client_quotation(fixture.id,fixture.client_id,payload||jsonb_build_object('subject','MUST ROLLBACK'),jsonb_set(items,'{0,fee_value_id}',to_jsonb(gen_random_uuid())));
  RAISE EXCEPTION 'Invalid item unexpectedly saved';
 EXCEPTION WHEN foreign_key_violation THEN NULL; END;
 IF (SELECT subject FROM public.quotations WHERE id=fixture.id) <> 'Atomic editing regression' OR (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.id) FROM public.quotation_items i WHERE quotation_id=fixture.id) IS DISTINCT FROM before_items THEN RAISE EXCEPTION 'Failed edit did not roll back'; END IF;
 BEGIN
  PERFORM public.edit_pending_client_quotation(fixture.id,gen_random_uuid(),payload,items);
  RAISE EXCEPTION 'Another client edited quotation';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE public.quotations SET status='Approved' WHERE id=fixture.id;
 BEGIN
  PERFORM public.edit_pending_client_quotation(fixture.id,fixture.client_id,payload,items);
  RAISE EXCEPTION 'Approved quotation edited';
 EXCEPTION WHEN check_violation THEN NULL; END;
END $$;
SELECT 'Passed: rollback, ownership, approval lock, protected fields' AS checks;
ROLLBACK;