alter table public.profiles
  add column if not exists approval_status text not null default 'pending' check (approval_status in ('pending', 'approved')),
  add column if not exists failed_login_attempts integer not null default 0 check (failed_login_attempts >= 0),
  add column if not exists locked_at timestamptz,
  add column if not exists last_login_ip inet,
  add column if not exists last_login_at timestamptz;

update public.profiles set approval_status = 'approved' where role = 'administrator';