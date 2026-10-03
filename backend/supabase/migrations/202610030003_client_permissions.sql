create table public.client_permission_sets (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  permissions jsonb not null check (jsonb_typeof(permissions) = 'object'),
  revision integer not null default 1,
  updated_by uuid not null references public.profiles(id),
  updated_at timestamptz not null default now()
);
create table public.client_permission_audit (
  id bigint generated always as identity primary key,
  user_id uuid not null,
  actor_id uuid not null,
  before_permissions jsonb,
  after_permissions jsonb not null,
  revision integer not null,
  created_at timestamptz not null default now()
);
alter table public.client_permission_sets enable row level security;
alter table public.client_permission_audit enable row level security;
revoke all on public.client_permission_sets, public.client_permission_audit from anon, authenticated;
grant select on public.client_permission_sets to authenticated;
create policy client_permissions_read_own on public.client_permission_sets for select to authenticated using (user_id = auth.uid());

create or replace function public.save_client_permissions(p_actor_id uuid, p_user_id uuid, p_permissions jsonb, p_revision integer)
returns integer language plpgsql security invoker set search_path = public, pg_temp as $$
declare prior public.client_permission_sets%rowtype; next_revision integer; page_name text; action_name text;
begin
  if not exists (select 1 from public.profiles where id = p_actor_id and role in ('admin','administrator') and account_status = 'active' and approval_status = 'approved') then
    raise exception 'Administrator access is required' using errcode = '42501';
  end if;
  perform 1 from public.profiles where id = p_user_id and role = 'client' and client_id is not null for update;
  if not found then raise exception 'Linked client account not found' using errcode = '22023'; end if;
  if jsonb_typeof(p_permissions) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_permissions)) <> 12 then raise exception 'Invalid permissions' using errcode = '22023'; end if;
  foreach page_name in array array['dashboard','overview','quotations','fees','requirements','statements','poa','projects','notifications','customer-service','invoices','settings'] loop
    if jsonb_typeof(p_permissions->page_name) is distinct from 'object' or (select count(*) from jsonb_object_keys(p_permissions->page_name)) <> 5 then raise exception 'Invalid page permissions' using errcode = '22023'; end if;
    foreach action_name in array array['view','add','edit','update','delete'] loop
      if jsonb_typeof(p_permissions->page_name->action_name) is distinct from 'boolean' then raise exception 'Invalid action permissions' using errcode = '22023'; end if;
      if action_name <> 'view' and (p_permissions->page_name->>action_name)::boolean and not (p_permissions->page_name->>'view')::boolean then raise exception 'View permission is required' using errcode = '22023'; end if;
    end loop;
    if (p_permissions->page_name->>'update')::boolean and not (p_permissions->page_name->>'edit')::boolean then raise exception 'Edit permission is required to update' using errcode = '22023'; end if;
    if page_name in ('dashboard','overview','invoices') and ((p_permissions->page_name->>'add')::boolean or (p_permissions->page_name->>'edit')::boolean or (p_permissions->page_name->>'update')::boolean or (p_permissions->page_name->>'delete')::boolean) then raise exception 'This page is read-only' using errcode = '22023'; end if;
    if page_name = 'settings' and ((p_permissions->page_name->>'add')::boolean or (p_permissions->page_name->>'delete')::boolean) then raise exception 'Invalid settings actions' using errcode = '22023'; end if;
  end loop;
  select * into prior from public.client_permission_sets where user_id = p_user_id;
  if coalesce(prior.revision,0) <> p_revision then raise exception 'Permissions changed. Reload before saving.' using errcode = '40001'; end if;
  next_revision := coalesce(prior.revision,0) + 1;
  insert into public.client_permission_sets(user_id,permissions,revision,updated_by) values(p_user_id,p_permissions,next_revision,p_actor_id)
    on conflict(user_id) do update set permissions=excluded.permissions, revision=excluded.revision, updated_by=excluded.updated_by, updated_at=now();
  insert into public.client_permission_audit(user_id,actor_id,before_permissions,after_permissions,revision) values(p_user_id,p_actor_id,prior.permissions,p_permissions,next_revision);
  return next_revision;
end $$;
revoke all on function public.save_client_permissions(uuid,uuid,jsonb,integer) from public, anon, authenticated;
grant execute on function public.save_client_permissions(uuid,uuid,jsonb,integer) to service_role;
-- Restrictive policies also enforce the matrix for direct REST and Realtime reads.
create or replace function public.client_page_visible(p_page text, p_client_id uuid default null)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select case
    when p.role <> 'client' then true
    else p.approval_status = 'approved' and p.account_status = 'active' and p.client_id is not null
      and (p_client_id is null or p.client_id = p_client_id)
      and coalesce((s.permissions->p_page->>'view')::boolean, s.user_id is null)
    end from public.profiles p left join public.client_permission_sets s on s.user_id=p.id where p.id=auth.uid()), false);
$$;
revoke all on function public.client_page_visible(text,uuid) from public,anon;
grant execute on function public.client_page_visible(text,uuid) to authenticated;
create policy client_project_permission_boundary on public.projects as restrictive for select to authenticated
using (public.client_page_visible('projects',client_id) or public.client_page_visible('overview',client_id));
create policy client_statement_permission_boundary on public.statements as restrictive for select to authenticated
using (public.client_page_visible('statements',client_id));
create policy client_quotation_permission_boundary on public.quotations as restrictive for select to authenticated
using (public.client_page_visible('quotations',client_id) or (status='Approved' and public.client_page_visible('invoices',client_id)));
create policy client_requirement_permission_boundary on public.requirements as restrictive for select to authenticated
using (public.client_page_visible('requirements'));
create policy client_notification_permission_boundary on public.notifications as restrictive for select to authenticated
using (public.client_page_visible('notifications') or public.client_page_visible('overview'));

grant all on public.client_permission_sets, public.client_permission_audit to service_role;
grant usage, select on sequence public.client_permission_audit_id_seq to service_role;
