create table if not exists public.poa_documents (
  id uuid primary key default gen_random_uuid(),
  document_name text not null check (char_length(btrim(document_name)) between 1 and 160),
  s3_key text not null unique check (s3_key like 'aiptPOA/%'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.poa_document_countries (
  document_id uuid not null references public.poa_documents(id) on delete cascade,
  country_id uuid not null references public.countries(id),
  primary key (document_id, country_id)
);

create index if not exists poa_document_countries_country_id_idx
  on public.poa_document_countries(country_id);

alter table public.poa_documents enable row level security;
alter table public.poa_document_countries enable row level security;

revoke all on public.poa_documents, public.poa_document_countries
  from public, anon, authenticated;
grant select, insert, update, delete on public.poa_documents,
  public.poa_document_countries to service_role;

create or replace function public.save_poa_document(
  p_id uuid,
  p_document_name text,
  p_s3_key text,
  p_country_ids uuid[]
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  saved_id uuid;
  requested_count integer;
  active_count integer;
begin
  if p_document_name is null or char_length(btrim(p_document_name)) not between 1 and 160 then
    raise exception 'Document name must contain 1 to 160 characters.' using errcode = '23514';
  end if;
  if p_s3_key is null or p_s3_key not like 'aiptPOA/%' then
    raise exception 'Invalid POA storage key.' using errcode = '23514';
  end if;

  requested_count := coalesce(cardinality(p_country_ids), 0);
  if requested_count > 0 then
    select count(distinct country_id)::integer into active_count
    from public.countries
    where id = any(p_country_ids) and deleted_at is null;
    if active_count <> requested_count then
      raise exception 'One or more selected countries are no longer available.' using errcode = '23514';
    end if;
  end if;

  if p_id is null then
    insert into public.poa_documents(document_name, s3_key)
    values (btrim(p_document_name), p_s3_key)
    returning id into saved_id;
  else
    update public.poa_documents
    set document_name = btrim(p_document_name), s3_key = p_s3_key, updated_at = now()
    where id = p_id
    returning id into saved_id;
    if saved_id is null then
      raise exception 'POA document not found.' using errcode = 'P0002';
    end if;
    delete from public.poa_document_countries where document_id = saved_id;
  end if;

  if requested_count > 0 then
    insert into public.poa_document_countries(document_id, country_id)
    select saved_id, country_id
    from (select distinct unnest(p_country_ids) as country_id) selected;
  end if;

  return saved_id;
end;
$$;

revoke all on function public.save_poa_document(uuid, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.save_poa_document(uuid, text, text, uuid[]) to service_role;
