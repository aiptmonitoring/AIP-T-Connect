-- Enforce validation/reconciliation gates inside the database transaction.

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
    select 1
    from public.fee_dataset_versions
    where id = p_version_id
      and status in ('staging', 'validating', 'reconciling')
      and deleted_at is null
      and coalesce((validation_summary->>'valid')::boolean, false)
      and coalesce((reconciliation_summary->>'mismatch')::boolean, false) = false
  ) then
    raise exception 'Fee dataset has not passed validation and reconciliation';
  end if;

  update public.fee_dataset_versions
  set status = 'archived', updated_at = now()
  where status = 'published' and id <> p_version_id;

  update public.fee_dataset_versions
  set status = 'published',
      published_at = now(),
      published_by = p_actor_id,
      updated_at = now()
  where id = p_version_id;
end;
$$;

revoke all on function public.publish_fee_dataset(uuid, uuid) from public;
grant execute on function public.publish_fee_dataset(uuid, uuid) to service_role;

create or replace function public.rollback_fee_dataset(
  p_version_id uuid,
  p_actor_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  current_version_id uuid;
begin
  select id into current_version_id
  from public.fee_dataset_versions
  where status = 'published' and deleted_at is null
  order by published_at desc
  limit 1;

  if current_version_id is null or current_version_id = p_version_id then
    raise exception 'No different published dataset is available for rollback';
  end if;

  if not exists (
    select 1 from public.fee_dataset_versions
    where id = p_version_id
      and status in ('archived', 'published')
      and deleted_at is null
      and coalesce((validation_summary->>'valid')::boolean, false)
      and coalesce((reconciliation_summary->>'mismatch')::boolean, false) = false
  ) then
    raise exception 'Target dataset is not a valid rollback version';
  end if;

  update public.fee_dataset_versions
  set status = 'archived', updated_at = now()
  where id = current_version_id;

  update public.fee_dataset_versions
  set status = 'published',
      published_at = now(),
      published_by = p_actor_id,
      rolled_back_from_id = current_version_id,
      rolled_back_by = p_actor_id,
      rolled_back_at = now(),
      updated_at = now()
  where id = p_version_id;
end;
$$;

revoke all on function public.rollback_fee_dataset(uuid, uuid) from public;
grant execute on function public.rollback_fee_dataset(uuid, uuid) to service_role;
