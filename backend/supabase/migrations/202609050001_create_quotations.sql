create table if not exists public.quotation_reference_counters (
  reference_year integer not null,
  category_prefix text not null check (category_prefix in ('T', 'P', 'D', 'C', 'O')),
  next_sequence integer not null default 6001 check (next_sequence >= 1),
  primary key (reference_year, category_prefix)
);

create table if not exists public.quotations (
  id uuid primary key default gen_random_uuid(),
  reference_no text unique,
  client_id uuid not null references public.clients(id),
  project_id uuid references public.projects(id),
  primary_category text not null check (primary_category in ('Trademark', 'Patent', 'Design', 'Copyright', 'Others')),
  primary_country_id uuid not null references public.countries(id),
  status text not null default 'Pending Approval' check (status in ('Draft', 'Pending Approval', 'Approved', 'Rejected', 'Cancelled', 'Posted')),
  vat_rate numeric(7, 4) not null default 0 check (vat_rate >= 0 and vat_rate <= 100),
  discount numeric(12, 2) not null default 0 check (discount >= 0),
  total_official_fee numeric(12, 2) not null default 0,
  total_attorney_fee numeric(12, 2) not null default 0,
  total_other_fee numeric(12, 2) not null default 0,
  total_vat numeric(12, 2) not null default 0,
  grand_total numeric(12, 2) not null default 0,
  created_by uuid not null references auth.users(id),
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.quotation_items (
  id uuid primary key default gen_random_uuid(),
  quotation_id uuid not null references public.quotations(id) on delete cascade,
  country_id uuid not null references public.countries(id),
  category text not null check (category in ('Trademark', 'Patent', 'Design', 'Copyright', 'Others')),
  procedure_name text not null check (char_length(trim(procedure_name)) >= 1),
  fee_value_id uuid not null references public.fee_values(id),
  official_fee numeric(12, 2) not null default 0,
  attorney_fee numeric(12, 2) not null default 0,
  other_fee numeric(12, 2) not null default 0,
  class_type text check (class_type in ('Single', 'Multi')),
  class_count integer check (class_count is null or class_count >= 1),
  additional_fee_per_class numeric(12, 2) not null default 0 check (additional_fee_per_class >= 0),
  requirement_ids uuid[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists quotations_list_index on public.quotations (created_at desc) where deleted_at is null;
create index if not exists quotations_client_index on public.quotations (client_id) where deleted_at is null;
create index if not exists quotations_status_index on public.quotations (status) where deleted_at is null;
create index if not exists quotation_items_quotation_index on public.quotation_items (quotation_id);
create index if not exists quotation_items_fee_lookup_index on public.quotation_items (country_id, category, procedure_name);

create or replace function public.next_quotation_reference(
  p_category text,
  p_country_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix text := case p_category
    when 'Trademark' then 'T'
    when 'Patent' then 'P'
    when 'Design' then 'D'
    when 'Copyright' then 'C'
    else 'O'
  end;
  country_abbreviation text;
  current_year integer := extract(year from current_date)::integer;
  sequence_number integer;
begin
  select upper(abbreviation) into country_abbreviation from public.countries where id = p_country_id and deleted_at is null;
  if country_abbreviation is null then raise exception 'The quotation country is invalid.'; end if;
  insert into public.quotation_reference_counters(reference_year, category_prefix, next_sequence)
  values (current_year, prefix, 6002)
  on conflict (reference_year, category_prefix) do update set next_sequence = quotation_reference_counters.next_sequence + 1
  returning next_sequence - 1 into sequence_number;
  return format('%s-%s-%s-%s', prefix, current_year, sequence_number, country_abbreviation);
end;
$$;

create or replace function public.assign_quotation_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reference_no is null or trim(new.reference_no) = '' then
    new.reference_no := public.next_quotation_reference(new.primary_category, new.primary_country_id);
  end if;
  return new;
end;
$$;

drop trigger if exists quotations_assign_reference on public.quotations;
create trigger quotations_assign_reference
before insert on public.quotations
for each row execute procedure public.assign_quotation_reference();

drop trigger if exists quotations_set_updated_at on public.quotations;
create trigger quotations_set_updated_at before update on public.quotations for each row execute procedure public.set_updated_at();

alter table public.quotations enable row level security;
alter table public.quotation_items enable row level security;
create policy quotations_authenticated_read on public.quotations for select to authenticated using (deleted_at is null);
create policy quotation_items_authenticated_read on public.quotation_items for select to authenticated using (exists (select 1 from public.quotations q where q.id = quotation_id and q.deleted_at is null));
