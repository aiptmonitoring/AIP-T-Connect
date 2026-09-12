-- Harden checkpoint recovery and stale lock handling.

alter table public.fee_sync_checkpoints
  add column if not exists last_processed_position integer not null default 0,
  add column if not exists last_successful_position integer not null default 0,
  add column if not exists last_activity_at timestamptz not null default now(),
  add column if not exists heartbeat_at timestamptz not null default now(),
  add column if not exists recovery_attempts integer not null default 0;

create unique index if not exists fee_sync_checkpoint_batch_unique
  on public.fee_sync_checkpoints(sync_run_id, sheet_name, current_batch);

create index if not exists fee_sync_checkpoints_latest_idx
  on public.fee_sync_checkpoints(sync_run_id, sheet_name, current_batch desc, created_at desc);

create index if not exists fee_sync_active_runs_idx
  on public.fee_sync_runs(started_at desc)
  where status in ('queued', 'starting', 'running', 'validating', 'reconciling', 'publishing', 'recovering');

create index if not exists fee_sync_stale_locks_idx
  on public.fee_sync_locks(expires_at, heartbeat_at)
  where released_at is null;
