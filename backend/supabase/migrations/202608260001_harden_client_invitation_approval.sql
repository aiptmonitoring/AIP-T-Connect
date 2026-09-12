alter table public.profiles
  drop constraint if exists profiles_approval_status_check;

alter table public.profiles
  add constraint profiles_approval_status_check
  check (approval_status in ('pending', 'approved', 'rejected', 'suspended')),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id) on delete set null,
  add column if not exists reviewed_at timestamptz,
  add column if not exists reviewed_by uuid references auth.users(id) on delete set null;

alter table public.client_invitations
  add column if not exists claimed_by uuid references auth.users(id) on delete set null;

alter table public.client_registration_claims
  add column if not exists claimed_by uuid references auth.users(id) on delete set null;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  registration_type text := coalesce(new.raw_user_meta_data ->> 'registration_type', 'new_company');
  claim_id uuid;
  claim public.client_registration_claims;
  invitation public.client_invitations;
  now_at timestamptz := now();
begin
  if registration_type = 'existing_company' then
    claim_id := nullif(new.raw_user_meta_data ->> 'registration_claim_id', '')::uuid;
    select * into claim from public.client_registration_claims
      where id = claim_id and email = lower(trim(new.email)) for update;
    if claim.id is null or claim.consumed_at is not null or claim.expires_at <= now_at then
      raise exception 'The verified invitation claim is invalid or expired.';
    end if;
    select * into invitation from public.client_invitations
      where id = claim.invitation_id and client_id = claim.client_id and email = claim.email for update;
    if invitation.id is null or invitation.consumed_at is not null
       or invitation.revoked_at is not null or invitation.expires_at <= now_at then
      raise exception 'The client invitation is invalid or expired.';
    end if;
    if not exists (select 1 from public.clients where id = claim.client_id and status = 'Active' and deleted_at is null) then
      raise exception 'The invited client is not active.';
    end if;

    insert into public.profiles (id, full_name, company_name, logo_url, role, client_id)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      coalesce(new.raw_user_meta_data ->> 'company_name', ''), null, 'client', claim.client_id)
    on conflict (id) do update set full_name = excluded.full_name,
      company_name = excluded.company_name, client_id = excluded.client_id;

    insert into public.client_memberships (client_id, user_id, membership_role, status)
    values (claim.client_id, new.id, 'company_admin', 'pending')
    on conflict (client_id, user_id) do update set status = 'pending';

    update public.client_registration_claims set consumed_at = now_at, claimed_by = new.id where id = claim.id;
    update public.client_invitations set consumed_at = now_at, claimed_by = new.id where id = invitation.id;
  else
    insert into public.profiles (id, full_name, company_name, logo_url, role)
    values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', ''),
      coalesce(new.raw_user_meta_data ->> 'company_name', ''), null, 'client')
    on conflict (id) do update set full_name = excluded.full_name,
      company_name = excluded.company_name, logo_url = excluded.logo_url;
  end if;
  return new;
end;
$$;

-- An expired invitation is revoked by the Edge Function before a replacement
-- is created. This index prevents concurrent active invitations for one client.
with ranked_active as (
  select id, row_number() over (partition by client_id order by created_at desc, id desc) as position
  from public.client_invitations
  where consumed_at is null and revoked_at is null
)
update public.client_invitations invitation
set revoked_at = now()
from ranked_active ranked
where invitation.id = ranked.id and ranked.position > 1;

create unique index if not exists client_invitations_one_active_per_client
  on public.client_invitations (client_id)
  where consumed_at is null and revoked_at is null;

create or replace function public.approve_existing_client_registration(
  p_user_id uuid,
  p_administrator_id uuid,
  p_claim_id uuid,
  p_email text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  claim public.client_registration_claims;
  invitation public.client_invitations;
  approved_client_id uuid;
  now_at timestamptz := now();
begin
  select * into claim
  from public.client_registration_claims
  where id = p_claim_id and email = lower(trim(p_email))
  for update;

  if claim.id is null or claim.consumed_at is null or claim.claimed_by <> p_user_id then
    raise exception 'The company invitation claim does not belong to this user.';
  end if;

  select * into invitation
  from public.client_invitations
  where id = claim.invitation_id and client_id = claim.client_id and email = claim.email
  for update;

  if invitation.id is null or invitation.consumed_at is null
     or invitation.claimed_by <> p_user_id or invitation.revoked_at is not null then
    raise exception 'The company invitation does not belong to this user.';
  end if;

  if exists (
    select 1 from public.profiles
    where client_id = claim.client_id and id <> p_user_id and approval_status = 'approved'
  ) then
    raise exception 'This client already has an approved account.';
  end if;

  insert into public.client_memberships
    (client_id, user_id, membership_role, status, approved_by, approved_at)
  values
    (claim.client_id, p_user_id, 'company_admin', 'approved', p_administrator_id, now_at)
  on conflict (client_id, user_id) do update set
    membership_role = excluded.membership_role,
    status = 'approved',
    approved_by = excluded.approved_by,
    approved_at = excluded.approved_at;

  update public.profiles set
    client_id = claim.client_id,
    approval_status = 'approved',
    account_status = 'active',
    approved_at = now_at,
    approved_by = p_administrator_id,
    reviewed_at = now_at,
    reviewed_by = p_administrator_id
  where id = p_user_id;

  insert into public.audit_logs
    (actor_id, entity_type, entity_id, action, before_data, after_data)
  values
    (p_administrator_id, 'user_approval', p_user_id, 'update',
     jsonb_build_object('approval_status', 'pending'),
     jsonb_build_object('approval_status', 'approved', 'client_id', claim.client_id));

  approved_client_id := claim.client_id;
  return approved_client_id;
end;
$$;

revoke all on function public.approve_existing_client_registration(uuid, uuid, uuid, text) from public;
grant execute on function public.approve_existing_client_registration(uuid, uuid, uuid, text) to service_role;

drop policy if exists "authenticated users can read active clients" on public.clients;
drop policy if exists "administrators can read active clients" on public.clients;
drop policy if exists "clients can read their own client" on public.clients;

create policy "administrators can read active clients"
on public.clients for select to authenticated
using (
  deleted_at is null and exists (
    select 1 from public.profiles where id = auth.uid() and role = 'administrator'
  )
);

create policy "clients can read their own client"
on public.clients for select to authenticated
using (
  deleted_at is null and exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'client'
      and approval_status = 'approved' and client_id = clients.id
  )
);
