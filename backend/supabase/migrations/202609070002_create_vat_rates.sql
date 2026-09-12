create table if not exists public.vat_rates (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id) on delete cascade,
  vat numeric(7, 4) not null default 0 check (vat >= 0 and vat <= 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint vat_rates_country_unique unique (country_id)
);

create index if not exists vat_rates_country_index on public.vat_rates(country_id) where deleted_at is null;

drop trigger if exists vat_rates_set_updated_at on public.vat_rates;
create trigger vat_rates_set_updated_at
before update on public.vat_rates
for each row execute procedure public.set_updated_at();

alter table public.vat_rates enable row level security;
create policy vat_rates_authenticated_read on public.vat_rates
for select to authenticated using (deleted_at is null);