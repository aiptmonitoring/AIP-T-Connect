begin;
do $$
declare
  country_ids uuid[];
  test_document_id uuid;
  actual_ids uuid[];
begin
  select array_agg(id) into country_ids from (select id from public.countries where deleted_at is null order by id limit 3) active_countries;
  if cardinality(country_ids) < 3 then raise exception 'Three active countries are required for this check.'; end if;
  test_document_id := public.save_poa_document(null, 'POA country regression', 'aiptPOA/regression-' || gen_random_uuid() || '.pdf', country_ids[1:2]);
  select array_agg(country_id order by country_id) into actual_ids from public.poa_document_countries where poa_document_countries.document_id = test_document_id;
  if actual_ids is distinct from country_ids[1:2] then raise exception 'Creation did not persist both countries.'; end if;
  perform public.save_poa_document(test_document_id, 'POA country regression updated', (select s3_key from public.poa_documents where id = test_document_id), country_ids[2:3]);
  select array_agg(country_id order by country_id) into actual_ids from public.poa_document_countries where poa_document_countries.document_id = test_document_id;
  if actual_ids is distinct from country_ids[2:3] then raise exception 'Update did not replace country associations.'; end if;
  perform public.save_poa_document(test_document_id, 'POA country regression shared', (select s3_key from public.poa_documents where id = test_document_id), '{}'::uuid[]);
  if exists (select 1 from public.poa_document_countries where poa_document_countries.document_id = test_document_id) then raise exception 'Shared update retained country links.'; end if;
  delete from public.poa_documents where id = test_document_id;
  if exists (select 1 from public.poa_document_countries where poa_document_countries.document_id = test_document_id) then raise exception 'Deletion retained country links.'; end if;
end;
$$;
rollback;
