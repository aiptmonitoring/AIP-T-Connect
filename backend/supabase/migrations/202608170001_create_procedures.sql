create table public.procedures (
  id uuid primary key default gen_random_uuid(),
  description varchar(255) not null check (char_length(trim(description)) >= 3),
  detail_text text not null check (char_length(trim(detail_text)) > 0),
  color_indication text not null check (color_indication in ('purple','blue','green','orange','red','teal','yellow','gray','pink','indigo')),
  service_id uuid not null references public.services(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index procedures_service_id_active_index on public.procedures(service_id) where deleted_at is null;
create index procedures_description_active_index on public.procedures(lower(description)) where deleted_at is null;
create trigger procedures_set_updated_at before update on public.procedures for each row execute procedure public.set_updated_at();
alter table public.procedures enable row level security;
create policy "authenticated users can read active procedures" on public.procedures for select to authenticated using (deleted_at is null);
