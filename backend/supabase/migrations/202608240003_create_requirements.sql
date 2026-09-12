create table if not exists public.requirements (
  id uuid primary key default gen_random_uuid(),
  country_id uuid not null references public.countries(id),
  description text not null check (char_length(trim(description)) between 3 and 5000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists requirements_country_active_index on public.requirements (country_id, created_at desc) where deleted_at is null;
drop trigger if exists requirements_set_updated_at on public.requirements;
create trigger requirements_set_updated_at before update on public.requirements for each row execute procedure public.set_updated_at();
alter table public.requirements enable row level security;
create policy "authenticated users can read active requirements" on public.requirements for select to authenticated using (deleted_at is null);
