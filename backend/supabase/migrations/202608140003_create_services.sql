create table public.services (
 id uuid primary key default gen_random_uuid(), name text not null, category text not null, description text not null, status text not null default 'active' check(status in ('active','inactive')), display_color text not null default '#633edb', display_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create unique index services_name_active_unique on public.services(lower(name)) where deleted_at is null;
create index services_list_index on public.services(display_order,name) where deleted_at is null;
create trigger services_set_updated_at before update on public.services for each row execute procedure public.set_updated_at();
alter table public.services enable row level security;
create policy "authenticated users can read active services" on public.services for select to authenticated using (deleted_at is null);
