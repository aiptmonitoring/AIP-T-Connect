create table if not exists public.countries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 120),
  abbreviation text not null check (abbreviation ~ '^[A-Z]{2,3}$'),
  flag_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists countries_name_active_unique on public.countries (lower(name)) where deleted_at is null;
create unique index if not exists countries_abbreviation_active_unique on public.countries (abbreviation) where deleted_at is null;
create index if not exists countries_active_index on public.countries (name) where deleted_at is null;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$ begin new.updated_at = now(); return new; end; $$;
drop trigger if exists countries_set_updated_at on public.countries;
create trigger countries_set_updated_at before update on public.countries for each row execute procedure public.set_updated_at();

alter table public.countries enable row level security;
create policy "authenticated users can read active countries" on public.countries for select to authenticated using (deleted_at is null);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid not null references auth.users(id),
  entity_type text not null,
  entity_id uuid not null,
  action text not null check (action in ('create', 'update', 'delete')),
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_logs enable row level security;
