alter table public.projects
  add column if not exists deadline_date date;

create index if not exists projects_deadline_active_index
  on public.projects (deadline_date)
  where deleted_at is null and deadline_date is not null;
