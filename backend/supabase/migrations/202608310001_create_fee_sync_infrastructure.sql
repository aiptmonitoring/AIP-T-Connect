-- Complete Fee Sync Infrastructure
-- Creates all tables, indexes, and policies for Google Sheets sync system

create extension if not exists pgcrypto;
create extension if not exists "uuid-ossp";

-- ============================================================================
-- FEE CATEGORIES
-- ============================================================================

create table if not exists public.fee_categories (
  id uuid primary key default uuid_generate_v4(),
  name text not null,
  description text,
  is_primary boolean default true,
  display_order integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,

  constraint fee_categories_name_unique unique(name)
);

create index if not exists fee_categories_name_idx on public.fee_categories(name);

-- ============================================================================
-- FEE SERVICES
-- ============================================================================

create table if not exists public.fee_services (
  id uuid primary key default uuid_generate_v4(),
  category_id uuid not null references public.fee_categories(id) on delete cascade,
  name text not null,
  description text,
  display_order integer,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,

  constraint fee_services_category_name_unique unique(category_id, name)
);

create index if not exists fee_services_category_idx on public.fee_services(category_id);

-- ============================================================================
-- FEE DATASET VERSIONS
-- ============================================================================

create table if not exists public.fee_dataset_versions (
  id uuid primary key default uuid_generate_v4(),
  version_number integer not null,
  status text not null default 'staging',
  sync_run_id uuid,
  published_at timestamptz,
  published_by uuid references auth.users(id) on delete set null,
  rolled_back_from_id uuid references public.fee_dataset_versions(id) on delete set null,
  rolled_back_by uuid references auth.users(id) on delete set null,
  rolled_back_at timestamptz,
  total_records integer default 0,
  total_categories integer default 0,
  total_countries integer default 0,
  total_services integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,

  constraint fee_dataset_versions_version_number_unique unique(version_number),
  constraint fee_dataset_versions_status_check check(status in ('staging', 'validating', 'reconciling', 'published', 'archived', 'rolled_back'))
);

create index if not exists fee_dataset_versions_version_number_idx on public.fee_dataset_versions(version_number desc);
create index if not exists fee_dataset_versions_status_idx on public.fee_dataset_versions(status);
create index if not exists fee_dataset_versions_published_at_idx on public.fee_dataset_versions(published_at desc);

-- ============================================================================
-- FEE VALUES (Main Fee Data)
-- ============================================================================

create table if not exists public.fee_values (
  id uuid primary key default uuid_generate_v4(),
  dataset_version_id uuid not null references public.fee_dataset_versions(id) on delete cascade,
  category_id uuid not null references public.fee_categories(id) on delete cascade,
  country_id uuid not null references public.countries(id) on delete cascade,
  service_id uuid not null references public.fee_services(id) on delete cascade,
  official_fee numeric(12, 2),
  attorney_fee numeric(12, 2),
  total_fee numeric(12, 2),
  currency text default 'USD',
  status text default 'active',
  source_sheet text,
  source_row integer,
  source_identifier text,
  source_checksum text,
  imported_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,

  constraint fee_values_idempotent_key unique(dataset_version_id, category_id, country_id, service_id),
  constraint fee_values_status_check check(status in ('active', 'inactive', 'deleted'))
);

create index if not exists fee_values_dataset_version_idx on public.fee_values(dataset_version_id);
create index if not exists fee_values_category_idx on public.fee_values(category_id);
create index if not exists fee_values_country_idx on public.fee_values(country_id);
create index if not exists fee_values_service_idx on public.fee_values(service_id);
create index if not exists fee_values_api_lookup_idx on public.fee_values(dataset_version_id, category_id, country_id, service_id) where status = 'active';
create index if not exists fee_values_source_idx on public.fee_values(source_sheet, source_row);

-- ============================================================================
-- FEE SYNC RUNS
-- ============================================================================

create table if not exists public.fee_sync_runs (
  id uuid primary key default uuid_generate_v4(),
  dataset_version_id uuid references public.fee_dataset_versions(id) on delete set null,
  status text not null default 'queued',
  current_stage text,
  current_sheet text,
  current_batch integer,
  total_batches integer,
  processed_rows integer default 0,
  total_rows integer default 0,
  inserted_count integer default 0,
  updated_count integer default 0,
  unchanged_count integer default 0,
  skipped_count integer default 0,
  error_count integer default 0,
  source_record_count integer default 0,
  valid_record_count integer default 0,
  invalid_record_count integer default 0,
  current_operation text,
  error_message text,
  started_by uuid references auth.users(id) on delete set null,
  started_at timestamptz default now(),
  completed_at timestamptz,
  last_activity_at timestamptz default now(),
  heartbeat_at timestamptz default now(),
  recovery_attempts integer default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,

  constraint fee_sync_runs_status_check check(status in ('queued', 'starting', 'running', 'validating', 'reconciling', 'publishing', 'completed', 'failed', 'interrupted', 'recovering', 'cancelled'))
);

create index if not exists fee_sync_runs_status_idx on public.fee_sync_runs(status);
create index if not exists fee_sync_runs_started_at_idx on public.fee_sync_runs(started_at desc);
create index if not exists fee_sync_runs_dataset_version_idx on public.fee_sync_runs(dataset_version_id);

-- ============================================================================
-- FEE SYNC CHECKPOINTS
-- ============================================================================

create table if not exists public.fee_sync_checkpoints (
  id uuid primary key default uuid_generate_v4(),
  sync_run_id uuid not null references public.fee_sync_runs(id) on delete cascade,
  sheet_name text not null,
  current_batch integer not null,
  total_batches integer not null,
  processed_rows integer default 0,
  total_rows integer default 0,
  inserted_count integer default 0,
  updated_count integer default 0,
  skipped_count integer default 0,
  error_count integer default 0,
  started_at timestamptz default now(),
  completed_at timestamptz default now(),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index if not exists fee_sync_checkpoints_sync_run_idx on public.fee_sync_checkpoints(sync_run_id);
create index if not exists fee_sync_checkpoints_sheet_idx on public.fee_sync_checkpoints(sheet_name);

-- ============================================================================
-- FEE SYNC LOCKS (Concurrency Control)
-- ============================================================================

create table if not exists public.fee_sync_locks (
  id uuid primary key default uuid_generate_v4(),
  sync_run_id uuid references public.fee_sync_runs(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  acquired_at timestamptz default now(),
  expires_at timestamptz,
  heartbeat_at timestamptz default now(),
  released_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists fee_sync_locks_sync_run_idx on public.fee_sync_locks(sync_run_id);
create index if not exists fee_sync_locks_active_idx on public.fee_sync_locks(expires_at) where released_at is null;

-- ============================================================================
-- FEE SYNC LOGS (Event Logging)
-- ============================================================================

create table if not exists public.fee_sync_logs (
  id uuid primary key default uuid_generate_v4(),
  sync_run_id uuid not null references public.fee_sync_runs(id) on delete cascade,
  event_type text not null,
  severity text default 'info',
  message text,
  sheet_name text,
  batch_number integer,
  source_row integer,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  deleted_at timestamptz,

  constraint fee_sync_logs_severity_check check(severity in ('debug', 'info', 'warning', 'error', 'critical'))
);

create index if not exists fee_sync_logs_sync_run_idx on public.fee_sync_logs(sync_run_id);
create index if not exists fee_sync_logs_event_type_idx on public.fee_sync_logs(event_type);
create index if not exists fee_sync_logs_severity_idx on public.fee_sync_logs(severity);
create index if not exists fee_sync_logs_created_at_idx on public.fee_sync_logs(created_at desc);

-- ============================================================================
-- FEE SYNC ERRORS (Structured Error Tracking)
-- ============================================================================

create table if not exists public.fee_sync_errors (
  id uuid primary key default uuid_generate_v4(),
  sync_run_id uuid not null references public.fee_sync_runs(id) on delete cascade,
  sheet_name text,
  batch_number integer,
  source_row integer,
  error_type text not null,
  error_message text,
  retryable boolean default false,
  attempt_number integer default 1,
  max_attempts integer default 3,
  next_retry_at timestamptz,
  resolved_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz
);

create index if not exists fee_sync_errors_sync_run_idx on public.fee_sync_errors(sync_run_id);
create index if not exists fee_sync_errors_retryable_idx on public.fee_sync_errors(retryable) where resolved_at is null;
create index if not exists fee_sync_errors_next_retry_idx on public.fee_sync_errors(next_retry_at) where resolved_at is null;

-- ============================================================================
-- FEE SYNC SCHEDULES (Scheduled Sync Configuration)
-- ============================================================================

create table if not exists public.fee_sync_schedules (
  id uuid primary key default uuid_generate_v4(),
  enabled boolean default false,
  frequency text not null default 'daily',
  execution_time text,
  timezone text default 'UTC',
  next_scheduled_run_at timestamptz,
  last_run_at timestamptz,
  last_successful_run_at timestamptz,
  last_error text,
  consecutive_failures integer default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,

  constraint fee_sync_schedules_frequency_check check(frequency in ('hourly', 'daily', 'weekly', 'monthly'))
);

create index if not exists fee_sync_schedules_enabled_idx on public.fee_sync_schedules(enabled);
create index if not exists fee_sync_schedules_next_run_idx on public.fee_sync_schedules(next_scheduled_run_at) where enabled = true;

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- fee_sync_runs: admins only
alter table public.fee_sync_runs enable row level security;
create policy fee_sync_runs_admin_select on public.fee_sync_runs
  for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));
create policy fee_sync_runs_admin_insert on public.fee_sync_runs
  for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));
create policy fee_sync_runs_admin_update on public.fee_sync_runs
  for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));

-- fee_sync_logs: admins only
alter table public.fee_sync_logs enable row level security;
create policy fee_sync_logs_admin_select on public.fee_sync_logs
  for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));

-- fee_sync_errors: admins only
alter table public.fee_sync_errors enable row level security;
create policy fee_sync_errors_admin_select on public.fee_sync_errors
  for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));

-- fee_sync_checkpoints: admins only
alter table public.fee_sync_checkpoints enable row level security;
create policy fee_sync_checkpoints_admin_select on public.fee_sync_checkpoints
  for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));

-- fee_sync_locks: admins only
alter table public.fee_sync_locks enable row level security;
create policy fee_sync_locks_admin_select on public.fee_sync_locks
  for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));

-- fee_sync_schedules: admins only
alter table public.fee_sync_schedules enable row level security;
create policy fee_sync_schedules_admin_select on public.fee_sync_schedules
  for select
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));
create policy fee_sync_schedules_admin_insert on public.fee_sync_schedules
  for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));
create policy fee_sync_schedules_admin_update on public.fee_sync_schedules
  for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));

-- fee_dataset_versions: published versions for all users, all versions for admins
alter table public.fee_dataset_versions enable row level security;
create policy fee_dataset_versions_public_read on public.fee_dataset_versions
  for select
  using (status = 'published' or exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));
create policy fee_dataset_versions_admin_insert on public.fee_dataset_versions
  for insert
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));
create policy fee_dataset_versions_admin_update on public.fee_dataset_versions
  for update
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));

-- fee_values: all authenticated users read published dataset only
alter table public.fee_values enable row level security;
create policy fee_values_authenticated_read on public.fee_values
  for select
  using (
    auth.uid() is not null and
    exists (
      select 1 from public.fee_dataset_versions fdv
      where fdv.id = fee_values.dataset_version_id and fdv.status = 'published'
    )
  );
create policy fee_values_admin_all on public.fee_values
  for all
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));

-- fee_categories: all authenticated users
alter table public.fee_categories enable row level security;
create policy fee_categories_authenticated_read on public.fee_categories
  for select
  using (auth.uid() is not null and deleted_at is null);

-- fee_services: all authenticated users
alter table public.fee_services enable row level security;
create policy fee_services_authenticated_read on public.fee_services
  for select
  using (auth.uid() is not null and deleted_at is null);

-- ============================================================================
-- INSERT DEFAULT CATEGORIES
-- ============================================================================

insert into public.fee_categories (name, description, is_primary, display_order)
values
  ('Trademark', 'Trademark fees and services', true, 1),
  ('Patent', 'Patent fees and services', true, 2),
  ('Design', 'Design fees and services', true, 3),
  ('Copyright', 'Copyright fees and services', true, 4),
  ('Others', 'Other fees and services', false, 5)
on conflict (name) do nothing;

-- ============================================================================
-- CREATE PUBLISH FUNCTION
-- ============================================================================

create or replace function public.publish_fee_dataset(
  p_version_id uuid,
  p_actor_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.fee_dataset_versions
    where id = p_version_id and status in ('staging', 'validating', 'reconciling') and deleted_at is null
  ) then
    raise exception 'Fee dataset is not publishable';
  end if;

  -- Archive previous published version
  update public.fee_dataset_versions
  set status = 'archived', updated_at = now()
  where status = 'published' and id <> p_version_id and deleted_at is null;

  -- Publish new version
  update public.fee_dataset_versions
  set status = 'published', published_at = now(), published_by = p_actor_id, updated_at = now()
  where id = p_version_id;
end;
$$;

revoke all on function public.publish_fee_dataset(uuid, uuid) from public;
grant execute on function public.publish_fee_dataset(uuid, uuid) to service_role;
