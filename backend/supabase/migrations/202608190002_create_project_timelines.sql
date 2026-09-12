-- Timeline entries record every procedure step performed for an IP application.
-- Attachments are kept separately so one step can contain multiple documents.
create table if not exists public.project_timelines (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  procedure_id uuid not null references public.procedures(id),
  timeline_date date not null,
  description text not null check (char_length(trim(description)) between 3 and 5000),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table if not exists public.project_timeline_documents (
  id uuid primary key default gen_random_uuid(),
  timeline_id uuid not null references public.project_timelines(id),
  object_key text not null,
  document_name varchar(255) not null check (char_length(trim(document_name)) between 1 and 255),
  document_size bigint not null check (document_size between 1 and 10485760),
  document_type varchar(255) not null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists project_timeline_documents_object_key_unique
  on public.project_timeline_documents (object_key)
  where deleted_at is null;
create index if not exists project_timelines_project_active_index
  on public.project_timelines (project_id, timeline_date desc, created_at desc)
  where deleted_at is null;
create index if not exists project_timelines_procedure_active_index
  on public.project_timelines (procedure_id)
  where deleted_at is null;
create index if not exists project_timeline_documents_timeline_active_index
  on public.project_timeline_documents (timeline_id, created_at)
  where deleted_at is null;

drop trigger if exists project_timelines_set_updated_at on public.project_timelines;
create trigger project_timelines_set_updated_at
  before update on public.project_timelines
  for each row execute procedure public.set_updated_at();

-- A timeline step must use a procedure that belongs to the application service.
create or replace function public.validate_project_timeline_integrity()
returns trigger
language plpgsql
as $$
declare
  project_service_id uuid;
  procedure_service_id uuid;
begin
  select service_id
    into project_service_id
    from public.projects
   where id = new.project_id
     and deleted_at is null;

  select service_id
    into procedure_service_id
    from public.procedures
   where id = new.procedure_id
     and deleted_at is null;

  if project_service_id is null then
    raise exception 'The application no longer exists.' using errcode = '23514';
  end if;

  if procedure_service_id is null or procedure_service_id <> project_service_id then
    raise exception 'The selected procedure must belong to this application service.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists project_timelines_validate_integrity on public.project_timelines;
create trigger project_timelines_validate_integrity
  before insert or update of project_id, procedure_id
  on public.project_timelines
  for each row execute procedure public.validate_project_timeline_integrity();

alter table public.project_timelines enable row level security;
alter table public.project_timeline_documents enable row level security;

create policy "authenticated users can read active project timelines"
  on public.project_timelines for select to authenticated
  using (deleted_at is null);
create policy "authenticated users can read active project timeline documents"
  on public.project_timeline_documents for select to authenticated
  using (deleted_at is null);
