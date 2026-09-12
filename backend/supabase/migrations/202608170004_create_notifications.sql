create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  notification_date timestamptz not null,
  description varchar(500) not null check (char_length(trim(description)) >= 3),
  document_key text,
  document_name text,
  document_size bigint check (document_size is null or document_size between 1 and 10485760),
  document_type text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.notification_countries (
  notification_id uuid not null references public.notifications(id) on delete cascade,
  country_id uuid not null references public.countries(id),
  primary key (notification_id,country_id)
);
create index notifications_date_active_index on public.notifications(notification_date desc) where deleted_at is null;
create trigger notifications_set_updated_at before update on public.notifications for each row execute procedure public.set_updated_at();
alter table public.notifications enable row level security;
alter table public.notification_countries enable row level security;
create policy "authenticated users can read notifications" on public.notifications for select to authenticated using (deleted_at is null);
create policy "authenticated users can read notification countries" on public.notification_countries for select to authenticated using (true);
