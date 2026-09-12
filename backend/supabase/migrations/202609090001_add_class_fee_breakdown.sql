alter table public.fee_class_values
  add column if not exists official_fee numeric(12, 2),
  add column if not exists attorney_fee numeric(12, 2);

create table if not exists public.fee_claiming_priority_values (
  id uuid primary key default gen_random_uuid(),
  dataset_version_id uuid not null references public.fee_dataset_versions(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  official_fee numeric(12, 2),
  attorney_fee numeric(12, 2),
  total_fee numeric(12, 2),
  currency text not null default 'USD',
  source_sheet text not null default 'Classes',
  source_row integer,
  source_values jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (dataset_version_id, country_id)
);

create index if not exists fee_claiming_priority_dataset_idx on public.fee_claiming_priority_values(dataset_version_id);
create index if not exists fee_claiming_priority_country_idx on public.fee_claiming_priority_values(country_id);

alter table public.fee_claiming_priority_values enable row level security;
create policy fee_claiming_priority_authenticated_read on public.fee_claiming_priority_values
  for select to authenticated
  using (exists (
    select 1 from public.fee_dataset_versions version
    where version.id = fee_claiming_priority_values.dataset_version_id
      and version.status = 'published'
  ));
create policy fee_claiming_priority_admin_all on public.fee_claiming_priority_values
  for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));