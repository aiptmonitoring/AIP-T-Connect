BEGIN;
-- Lock the quotation and replace its items in one transaction. Only the authenticated
-- edge function's service role may call this; it supplies the verified client ID.
create or replace function public.edit_pending_client_quotation(
 p_quotation_id uuid, p_client_id uuid, p_payload jsonb, p_items jsonb
) returns jsonb language plpgsql security invoker set search_path = public as $$
declare existing public.quotations; edited public.quotations;
begin
 select * into existing from public.quotations
 where id = p_quotation_id and client_id = p_client_id and deleted_at is null for update;
 if not found then raise exception 'Quotation not found for this client.' using errcode = '42501'; end if;
 if existing.status <> 'Pending Approval' then
  raise exception 'Only pending quotations can be edited.' using errcode = '23514';
 end if;
 if p_payload->>'client_id' is distinct from p_client_id::text then
  raise exception 'Quotation ownership cannot be changed.' using errcode = '42501';
 end if;
 if jsonb_typeof(p_items) is distinct from 'array' or jsonb_array_length(p_items) = 0 then
  raise exception 'At least one quotation item is required.' using errcode = '23514';
 end if;
 edited := jsonb_populate_record(existing, p_payload);
 update public.quotations set
 project_id = edited.project_id,
 primary_category = edited.primary_category,
 primary_country_id = edited.primary_country_id,
 client_matter_ref = edited.client_matter_ref,
 invoice_date = edited.invoice_date,
 subject = edited.subject,
 currency = edited.currency,
 vatable = edited.vatable,
 vat_rate = edited.vat_rate,
 discount = edited.discount,
 total_official_fee = edited.total_official_fee,
 total_attorney_fee = edited.total_attorney_fee,
 total_other_fee = edited.total_other_fee,
 total_vat = edited.total_vat,
 grand_total = edited.grand_total, updated_at = now()
 where id = existing.id;
 delete from public.quotation_items where quotation_id = existing.id;
 insert into public.quotation_items (quotation_id, country_id, category, procedure_name, fee_value_id, quantity, class_numbers, class_type, class_count, class_pricing_rows, additional_fee_per_class, official_fee, attorney_fee, other_fee, vat_rate, requirement_ids, claiming_priority, claiming_priority_fee, state_country_ids, state_fee_total)
 select existing.id, item.country_id, item.category, item.procedure_name, item.fee_value_id, item.quantity, item.class_numbers, item.class_type, item.class_count, item.class_pricing_rows, item.additional_fee_per_class, item.official_fee, item.attorney_fee, item.other_fee, item.vat_rate, item.requirement_ids, item.claiming_priority, item.claiming_priority_fee, item.state_country_ids, item.state_fee_total
 from jsonb_populate_recordset(null::public.quotation_items, p_items) as item;
 return jsonb_build_object('id',existing.id,'reference_no',existing.reference_no,
  'invoice_verification_token',existing.invoice_verification_token);
end;
$$;
revoke all on function public.edit_pending_client_quotation(uuid,uuid,jsonb,jsonb) from public, anon, authenticated;
grant execute on function public.edit_pending_client_quotation(uuid,uuid,jsonb,jsonb) to service_role;

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