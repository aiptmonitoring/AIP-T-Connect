-- Store authoritative progress values computed by the server.

alter table public.fee_sync_runs
  add column if not exists percentage integer not null default 0,
  add column if not exists sheet_progress jsonb not null default '{"Trademark":"pending","Patent":"pending","Design":"pending","Copyright":"pending","Others":"pending"}'::jsonb;

alter table public.fee_sync_runs
  add constraint fee_sync_runs_percentage_check check (percentage between 0 and 100);
