alter table public.projects
  add column if not exists approval_status text not null default 'pending'
    check (approval_status in ('draft', 'pending', 'approved', 'rejected')),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

create index if not exists projects_client_approved_active_index
  on public.projects (client_id, matter_date desc)
  where deleted_at is null and approval_status = 'approved';

create index if not exists projects_approval_active_index
  on public.projects (approval_status, matter_date desc)
  where deleted_at is null;

drop policy if exists "clients can read their active projects" on public.projects;
create policy "clients can read approved active projects"
on public.projects
for select to authenticated
using (
  deleted_at is null
  and approval_status = 'approved'
  and exists (
    select 1
      from public.profiles
     where id = auth.uid()
       and role = 'client'
       and client_id = projects.client_id
       and approval_status = 'approved'
       and account_status = 'active'
  )
);
