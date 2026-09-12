alter table public.statements
  add column if not exists payment_status text not null default 'unpaid' check (payment_status in ('unpaid', 'paid')),
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references auth.users(id);
