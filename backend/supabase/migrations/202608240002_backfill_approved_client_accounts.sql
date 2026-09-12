-- Ensure every approved client account with complete registration data is
-- represented by, and linked to, the Clients-page source-of-truth record.
insert into public.clients (
  company_name, email, phone, client_type, address, country_id, notes, status
)
select
  trim(auth_user.raw_user_meta_data ->> 'company_name'),
  lower(trim(auth_user.email)),
  trim(auth_user.raw_user_meta_data ->> 'phone'),
  'Corporate',
  trim(auth_user.raw_user_meta_data ->> 'address'),
  country.id,
  'Created from an approved client registration.',
  'Active'
from public.profiles profile
join auth.users auth_user on auth_user.id = profile.id
join public.countries country
  on lower(trim(country.name)) = lower(trim(auth_user.raw_user_meta_data ->> 'country'))
 and country.deleted_at is null
where profile.role = 'client'
  and profile.approval_status = 'approved'
  and profile.client_id is null
  and coalesce(trim(auth_user.email), '') <> ''
  and coalesce(trim(auth_user.raw_user_meta_data ->> 'company_name'), '') <> ''
  and coalesce(trim(auth_user.raw_user_meta_data ->> 'phone'), '') <> ''
  and coalesce(trim(auth_user.raw_user_meta_data ->> 'address'), '') <> ''
  and not exists (
    select 1 from public.clients client
    where client.deleted_at is null
      and (
        lower(trim(client.email)) = lower(trim(auth_user.email))
        or lower(trim(client.company_name)) = lower(trim(auth_user.raw_user_meta_data ->> 'company_name'))
      )
  )
on conflict do nothing;

update public.profiles profile
set client_id = client.id
from auth.users auth_user
join public.clients client
  on client.deleted_at is null
 and lower(trim(client.email)) = lower(trim(auth_user.email))
where profile.id = auth_user.id
  and profile.role = 'client'
  and profile.approval_status = 'approved'
  and profile.client_id is null;

update public.profiles profile
set client_id = client.id
from auth.users auth_user
join public.clients client
  on client.deleted_at is null
 and lower(trim(client.company_name)) = lower(trim(auth_user.raw_user_meta_data ->> 'company_name'))
where profile.id = auth_user.id
  and profile.role = 'client'
  and profile.approval_status = 'approved'
  and profile.client_id is null;
