-- Existing users created before the signup trigger also need a profile.
-- Existing profiles are preserved, including administrator and associate roles.
insert into public.profiles (id, full_name, role)
select
  users.id,
  coalesce(users.raw_user_meta_data ->> 'full_name', ''),
  'client'
from auth.users as users
on conflict (id) do nothing;
