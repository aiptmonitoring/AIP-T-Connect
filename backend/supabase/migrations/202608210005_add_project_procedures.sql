-- Allow an application to reference multiple procedures while retaining procedure_id
-- as the primary procedure for existing timeline and dashboard contracts.
create table if not exists public.project_procedures (
  project_id uuid not null references public.projects(id) on delete cascade,
  procedure_id uuid not null references public.procedures(id),
  sort_order smallint not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  primary key (project_id, procedure_id)
);

create index if not exists project_procedures_procedure_index on public.project_procedures (procedure_id, project_id);
alter table public.project_procedures enable row level security;
create policy "authenticated users can read project procedures"
  on public.project_procedures for select to authenticated using (true);

insert into public.project_procedures (project_id, procedure_id, sort_order)
select id, procedure_id, 0
  from public.projects
on conflict (project_id, procedure_id) do nothing;
