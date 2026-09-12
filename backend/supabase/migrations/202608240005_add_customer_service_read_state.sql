alter table public.customer_service_tickets
  add column if not exists client_last_read_at timestamptz,
  add column if not exists administrator_last_read_at timestamptz;

create index if not exists customer_messages_unread_index
  on public.customer_service_messages(ticket_id, sender_role, created_at desc);
