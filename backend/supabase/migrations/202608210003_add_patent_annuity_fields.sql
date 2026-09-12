alter table public.projects
  add column if not exists annuity_years smallint,
  add column if not exists annuity_date date;

alter table public.projects
  drop constraint if exists projects_annuity_years_range;

alter table public.projects
  add constraint projects_annuity_years_range
  check (annuity_years is null or annuity_years between 1 and 50);
