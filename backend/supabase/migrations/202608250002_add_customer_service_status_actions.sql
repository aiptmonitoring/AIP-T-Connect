create table if not exists public.customer_service_status_actions (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.customer_service_tickets(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  from_status varchar(20) not null check (from_status in ('Open', 'Pending', 'Resolved')),
  to_status varchar(20) not null check (to_status in ('Open', 'Pending', 'Resolved')),
  note varchar(500),
  created_at timestamptz not null default now()
);

create index if not exists customer_service_status_actions_ticket_index
  on public.customer_service_status_actions (ticket_id, created_at);

alter table public.customer_service_status_actions enable row level security;

create or replace function public.update_customer_service_ticket_status(
  p_ticket_id uuid,
  p_status varchar,
  p_actor_id uuid,
  p_note varchar default null
) returns public.customer_service_tickets
language plpgsql
security definer
set search_path = public
as $$
declare
  current_ticket public.customer_service_tickets;
  updated_ticket public.customer_service_tickets;
  clean_note varchar(500);
begin
  if p_status not in ('Open', 'Pending', 'Resolved') then
    raise exception 'Invalid customer-service status.';
  end if;

  select * into current_ticket
  from public.customer_service_tickets
  where id = p_ticket_id and deleted_at is null
  for update;

  if current_ticket.id is null then
    raise exception 'Conversation not found.';
  end if;

  clean_note := nullif(left(trim(coalesce(p_note, '')), 500), '');

  if current_ticket.status = p_status then
    return current_ticket;
  end if;

  update public.customer_service_tickets
  set status = p_status
  where id = p_ticket_id
  returning * into updated_ticket;

  insert into public.customer_service_status_actions
    (ticket_id, actor_id, from_status, to_status, note)
  values
    (p_ticket_id, p_actor_id, current_ticket.status, p_status, clean_note);

  return updated_ticket;
end;
$$;

revoke all on function public.update_customer_service_ticket_status(uuid, varchar, uuid, varchar) from public;
grant execute on function public.update_customer_service_ticket_status(uuid, varchar, uuid, varchar) to service_role;
