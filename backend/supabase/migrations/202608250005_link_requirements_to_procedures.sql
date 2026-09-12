alter table public.requirements
  add column if not exists procedure_id uuid references public.procedures(id);

create index if not exists requirements_procedure_active_index
  on public.requirements (procedure_id, created_at desc)
  where deleted_at is null;

comment on column public.requirements.procedure_id is
  'Procedure selected from the live procedures catalogue. Nullable only for legacy requirement rows.';
