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
