-- Secure multi-user company membership model.
-- Existing profiles.client_id remains as a compatibility pointer for current APIs.

create table if not exists public.client_memberships (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  membership_role text not null default 'member'
    check (membership_role in ('company_admin', 'manager', 'member', 'viewer')),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, user_id)
);

create table if not exists public.client_invitations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  email text not null check (email = lower(trim(email)) and char_length(email) between 3 and 320),
  token_hash text not null unique,
  membership_role text not null default 'member'
    check (membership_role in ('company_admin', 'manager', 'member', 'viewer')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  invited_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  check (expires_at > created_at)
);

create table if not exists public.client_registration_claims (
  id uuid primary key default gen_random_uuid(),
  invitation_id uuid not null references public.client_invitations(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  email text not null check (email = lower(trim(email))),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (invitation_id, email)
);

create index if not exists client_memberships_user_status_idx
  on public.client_memberships (user_id, status);
create index if not exists client_memberships_client_status_idx
  on public.client_memberships (client_id, status);
create index if not exists client_invitations_client_email_idx
  on public.client_invitations (client_id, email, expires_at desc);
create index if not exists client_registration_claims_lookup_idx
  on public.client_registration_claims (id, email, expires_at) where consumed_at is null;

drop trigger if exists client_memberships_set_updated_at on public.client_memberships;
create trigger client_memberships_set_updated_at before update on public.client_memberships
for each row execute procedure public.set_updated_at();

alter table public.client_memberships enable row level security;
alter table public.client_invitations enable row level security;
alter table public.client_registration_claims enable row level security;

-- Service-role Edge Functions perform writes. Users can only read their own
-- approved membership; this prevents company and invitation enumeration.
create policy "members can read their own membership"
on public.client_memberships for select to authenticated
using (user_id = auth.uid());

-- Backfill current approved client accounts without changing existing routing.
insert into public.client_memberships (client_id, user_id, membership_role, status, approved_by, approved_at)
select p.client_id, p.id,
  case when row_number() over (partition by p.client_id order by p.created_at, p.id) = 1
       then 'company_admin' else 'member' end,
  'approved', p.id, now()
from public.profiles p
where p.client_id is not null and p.approval_status = 'approved'
on conflict (client_id, user_id) do nothing;

