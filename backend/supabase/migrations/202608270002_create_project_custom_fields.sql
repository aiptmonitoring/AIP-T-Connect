create table if not exists public.project_field_definitions (
  id uuid primary key default gen_random_uuid(),
  name varchar(80) not null check (char_length(trim(name)) between 1 and 80),
  label varchar(120) not null check (char_length(trim(label)) between 1 and 120),
  field_type varchar(20) not null default 'text' check (field_type in ('text', 'number', 'date', 'boolean')),
  required boolean not null default false,
  display_order integer not null default 0 check (display_order >= 0),
  active boolean not null default true,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists project_field_definitions_name_active_unique
  on public.project_field_definitions (lower(name)) where deleted_at is null;
create index if not exists project_field_definitions_display_order_index
  on public.project_field_definitions (display_order, created_at) where deleted_at is null and active;

drop trigger if exists project_field_definitions_set_updated_at on public.project_field_definitions;
create trigger project_field_definitions_set_updated_at
  before update on public.project_field_definitions for each row execute procedure public.set_updated_at();

create table if not exists public.project_field_values (
  project_id uuid not null references public.projects(id) on delete cascade,
  field_definition_id uuid not null references public.project_field_definitions(id) on delete cascade,
  value jsonb not null default 'null'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (project_id, field_definition_id)
);

create index if not exists project_field_values_definition_index
  on public.project_field_values (field_definition_id, project_id);

drop trigger if exists project_field_values_set_updated_at on public.project_field_values;
create trigger project_field_values_set_updated_at
  before update on public.project_field_values for each row execute procedure public.set_updated_at();

alter table public.project_field_definitions enable row level security;
alter table public.project_field_values enable row level security;

create policy "authenticated users can read active project field definitions"
  on public.project_field_definitions for select to authenticated
  using (deleted_at is null and active);

create policy "administrators manage project field definitions"
  on public.project_field_definitions for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));

create policy "clients can read approved project field values"
  on public.project_field_values for select to authenticated
  using (exists (
    select 1 from public.projects
    join public.profiles on profiles.client_id = projects.client_id
    where projects.id = project_field_values.project_id
      and projects.deleted_at is null
      and projects.approval_status = 'approved'
      and profiles.id = auth.uid()
      and profiles.role = 'client'
  ));

create policy "administrators manage project field values"
  on public.project_field_values for all to authenticated
  using (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'))
  with check (exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator'));
