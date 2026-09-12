update public.profiles profile
set client_id = client.id
from auth.users auth_user
join public.clients client on lower(trim(client.email)) = lower(trim(auth_user.email))
where profile.id = auth_user.id
  and profile.role = 'client'
  and profile.client_id is null
  and client.deleted_at is null;