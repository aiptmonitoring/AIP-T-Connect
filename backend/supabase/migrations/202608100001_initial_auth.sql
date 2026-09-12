-- Initial authentication ownership boundary. Expand only as approved per AIPT flows.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  role text not null default 'client' check (role in ('administrator', 'client', 'associate', 'user')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles are visible to their owner"
on public.profiles for select to authenticated
using (id = auth.uid());
