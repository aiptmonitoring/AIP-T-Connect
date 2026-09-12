create table if not exists public.customer_service_tickets (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id),
  subject varchar(255) not null,
  category varchar(100) not null default 'General',
  priority varchar(20) not null default 'Normal' check (priority in ('Low','Normal','High','Urgent')),
  status varchar(20) not null default 'Open' check (status in ('Open','Pending','Resolved')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table if not exists public.customer_service_messages (
  id uuid primary key default gen_random_uuid(), ticket_id uuid not null references public.customer_service_tickets(id) on delete cascade,
  sender_id uuid references auth.users(id), sender_role varchar(20) not null check (sender_role in ('client','administrator')),
  message text not null check (char_length(trim(message)) between 1 and 5000), created_at timestamptz not null default now()
);
create index if not exists customer_tickets_client_index on public.customer_service_tickets(client_id,updated_at desc) where deleted_at is null;
create index if not exists customer_messages_ticket_index on public.customer_service_messages(ticket_id,created_at);
drop trigger if exists customer_tickets_set_updated_at on public.customer_service_tickets;
create trigger customer_tickets_set_updated_at before update on public.customer_service_tickets for each row execute procedure public.set_updated_at();
alter table public.customer_service_tickets enable row level security;
alter table public.customer_service_messages enable row level security;
