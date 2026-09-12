-- Fee sync repair contract.
-- Applies after 202608310001_create_fee_sync_infrastructure.sql.

create extension if not exists pgcrypto;

alter table public.fee_dataset_versions
  add column if not exists source_checksum text,
  add column if not exists validation_summary jsonb not null default '{}'::jsonb,
  add column if not exists reconciliation_summary jsonb not null default '{}'::jsonb;

alter table public.fee_values
  add column if not exists source_checksum text,
  add column if not exists imported_at timestamptz not null default now();

alter table public.fee_sync_runs
  add column if not exists current_operation text,
  add column if not exists source_record_count integer not null default 0,
  add column if not exists valid_record_count integer not null default 0,
  add column if not exists invalid_record_count integer not null default 0;

-- A partial unique index alone cannot serialize concurrent sync creation.
create unique index if not exists fee_sync_one_active_run
  on public.fee_sync_runs ((1))
  where status in ('queued', 'starting', 'running', 'validating', 'reconciling', 'publishing', 'recovering');

-- Only one lock can be active. Expired locks are released by the worker before
-- acquiring a new lease.
create unique index if not exists fee_sync_one_active_lock
  on public.fee_sync_locks ((1))
  where released_at is null;

create index if not exists fee_values_api_lookup_idx
  on public.fee_values (dataset_version_id, category_id, country_id, service_id)
  where status = 'active';

-- Publish is the only state transition that changes the data shown by /fees.
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
    where id = p_version_id and status in ('staging', 'validating') and deleted_at is null
  ) then
    raise exception 'Fee dataset is not publishable';
  end if;

  update public.fee_dataset_versions
  set status = 'archived', updated_at = now()
  where status = 'published' and id <> p_version_id;

  update public.fee_dataset_versions
  set status = 'published', published_at = now(), published_by = p_actor_id, updated_at = now()
  where id = p_version_id;
end;
$$;

revoke all on function public.publish_fee_dataset(uuid, uuid) from public;
grant execute on function public.publish_fee_dataset(uuid, uuid) to service_role;
