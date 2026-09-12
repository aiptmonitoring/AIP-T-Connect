alter table public.profiles
  add column if not exists company_name text not null default '',
  add column if not exists logo_url text,
  add column if not exists account_status text not null default 'active' check (account_status in ('active', 'inactive'));

update public.profiles set account_status = 'active' where account_status is null;

create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, company_name, logo_url, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'company_name', ''),
    null,
    'client'
  )
  on conflict (id) do update set
    full_name = excluded.full_name,
    company_name = excluded.company_name,
    logo_url = excluded.logo_url;
  return new;
end;
$$;