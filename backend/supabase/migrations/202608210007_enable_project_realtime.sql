do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
end;
$$;

drop policy if exists "authenticated users can read active projects" on public.projects;
drop policy if exists "administrators can read active projects" on public.projects;
drop policy if exists "clients can read their active projects" on public.projects;

create policy "administrators can read active projects" on public.projects
for select to authenticated
using (
  deleted_at is null
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator')
);

create policy "clients can read their active projects" on public.projects
for select to authenticated
using (
  deleted_at is null
  and exists (select 1 from public.profiles where id = auth.uid() and role = 'client' and client_id = projects.client_id)
);