alter table public.quotation_items
  add column if not exists claiming_priority boolean not null default false,
  add column if not exists claiming_priority_fee numeric(12, 2) not null default 0 check (claiming_priority_fee >= 0),
  add column if not exists state_country_ids uuid[] not null default '{}',
  add column if not exists state_fee_total numeric(12, 2) not null default 0 check (state_fee_total >= 0);

create index if not exists quotation_items_state_country_idx
  on public.quotation_items using gin (state_country_ids);