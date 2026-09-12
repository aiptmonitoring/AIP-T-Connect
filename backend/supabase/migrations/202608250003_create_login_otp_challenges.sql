create table if not exists public.login_otp_challenges (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  code_hash text not null,
  attempts smallint not null default 0 check (attempts between 0 and 5),
  resend_count smallint not null default 0 check (resend_count between 0 and 3),
  expires_at timestamptz not null,
  last_sent_at timestamptz not null default now(),
  consumed_at timestamptz,
  request_ip inet,
  created_at timestamptz not null default now()
);

create index if not exists login_otp_challenges_user_index
  on public.login_otp_challenges (user_id, created_at desc);

alter table public.login_otp_challenges enable row level security;

create or replace function public.consume_login_otp_challenge(
  p_challenge_id uuid,
  p_code_hash text
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  challenge public.login_otp_challenges;
begin
  select * into challenge
  from public.login_otp_challenges
  where id = p_challenge_id
  for update;

  if challenge.id is null or challenge.consumed_at is not null then
    return null;
  end if;

  if challenge.expires_at <= now() or challenge.attempts >= 5 then
    return null;
  end if;

  if challenge.code_hash <> p_code_hash then
    update public.login_otp_challenges
    set attempts = least(attempts + 1, 5)
    where id = p_challenge_id;
    return null;
  end if;

  update public.login_otp_challenges
  set consumed_at = now()
  where id = p_challenge_id;

  return challenge.user_id;
end;
$$;

revoke all on function public.consume_login_otp_challenge(uuid, text) from public;
grant execute on function public.consume_login_otp_challenge(uuid, text) to service_role;
