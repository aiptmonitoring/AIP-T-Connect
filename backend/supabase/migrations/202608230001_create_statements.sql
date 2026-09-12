create table public.statements (
  id uuid primary key default gen_random_uuid(),
  statement_date date not null,
  client_id uuid not null references public.clients(id),
  description varchar(1000) not null check (char_length(trim(description)) >= 3),
  document_key text,
  document_name text,
  document_size bigint,
  document_type text,
  approval_status text not null default 'pending' check (approval_status in ('pending', 'approved')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create index statements_client_date_index on public.statements (client_id, statement_date desc) where deleted_at is null;
create trigger statements_set_updated_at before update on public.statements for each row execute procedure public.set_updated_at();
alter table public.statements enable row level security;
create policy "authenticated users can read active statements" on public.statements for select to authenticated using (deleted_at is null);
