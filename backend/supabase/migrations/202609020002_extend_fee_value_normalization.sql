-- Preserve normalized region data and the original source row for audit/troubleshooting.
-- Reuses public.countries as the canonical country entity.

alter table public.fee_values
  add column if not exists region text,
  add column if not exists source_values jsonb not null default '[]'::jsonb;

create index if not exists fee_values_region_idx
  on public.fee_values(region)
  where status = 'active';

create index if not exists fee_values_source_identifier_idx
  on public.fee_values(dataset_version_id, source_sheet, source_identifier);
