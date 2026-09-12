alter table public.profiles
  add column if not exists client_id uuid references public.clients(id) on delete set null;

create index if not exists profiles_client_id_index on public.profiles (client_id)
  where client_id is not null;
