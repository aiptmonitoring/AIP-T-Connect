-- Add an explicit deterministic identity for idempotent fee imports.
-- The dataset version keeps historical snapshots isolated; record_key prevents
-- duplicates when a batch is retried within the same version.

alter table public.fee_values
  add column if not exists record_key text;

create unique index if not exists fee_values_dataset_record_key_unique
  on public.fee_values(dataset_version_id, record_key)
  where record_key is not null;

create index if not exists fee_values_record_key_idx
  on public.fee_values(record_key);
