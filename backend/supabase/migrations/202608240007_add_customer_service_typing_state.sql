alter table public.customer_service_read_state
  add column if not exists typing_until timestamptz;

create index if not exists customer_service_typing_state_index
  on public.customer_service_read_state(ticket_id, typing_until)
  where typing_until is not null;
