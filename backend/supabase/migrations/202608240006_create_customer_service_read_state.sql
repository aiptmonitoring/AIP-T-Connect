create table if not exists public.customer_service_read_state (
  ticket_id uuid not null references public.customer_service_tickets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (ticket_id, user_id)
);

alter table public.customer_service_read_state enable row level security;

alter table public.customer_service_tickets
  drop column if exists client_last_read_at,
  drop column if exists administrator_last_read_at;
