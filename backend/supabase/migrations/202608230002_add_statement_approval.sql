alter table public.statements
  add column if not exists approval_status text not null default 'pending' check (approval_status in ('pending', 'approved')),
  add column if not exists approved_at timestamptz,
  add column if not exists approved_by uuid references auth.users(id);
create index if not exists statements_approved_client_index on public.statements (client_id, statement_date desc) where deleted_at is null and approval_status = 'approved';
