alter table public.customer_service_messages
  add column if not exists reply_to_id uuid references public.customer_service_messages(id) on delete set null;

alter table public.customer_service_messages
  drop constraint if exists customer_service_messages_message_check;

alter table public.customer_service_messages
  add constraint customer_service_messages_message_check
  check (char_length(message) <= 5000);

create table if not exists public.customer_service_attachments (
  id uuid primary key default gen_random_uuid(),
  message_id uuid not null references public.customer_service_messages(id) on delete cascade,
  object_key text not null unique,
  file_name varchar(255) not null,
  file_size integer not null check (file_size between 1 and 10485760),
  file_type varchar(150) not null,
  is_image boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists customer_service_attachments_message_index
  on public.customer_service_attachments(message_id, created_at);

alter table public.customer_service_attachments enable row level security;
