create extension if not exists pgcrypto;

alter table public.quotations
	add column if not exists invoice_verification_token text;

update public.quotations
set invoice_verification_token = encode(gen_random_bytes(24), 'hex')
where invoice_verification_token is null;

alter table public.quotations
	alter column invoice_verification_token set default encode(gen_random_bytes(24), 'hex'),
	alter column invoice_verification_token set not null;

create unique index if not exists quotations_invoice_verification_token_key
	on public.quotations (invoice_verification_token);
