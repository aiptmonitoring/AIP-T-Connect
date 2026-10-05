create table if not exists public.video_tutorials (
  card_key text primary key check (card_key in (
    'quotations',
    'schedule-of-fees',
    'requirements',
    'statements',
    'poa',
    'projects',
    'notifications',
    'customer-service'
  )),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  s3_key text not null unique check (s3_key like 'aiptvideotutorial/%'),
  file_name text not null,
  content_type text not null,
  file_size bigint not null check (file_size > 0),
  updated_at timestamptz not null default now()
);

alter table public.video_tutorials enable row level security;
revoke all on public.video_tutorials from public, anon, authenticated;
grant select, insert, update, delete on public.video_tutorials to service_role;