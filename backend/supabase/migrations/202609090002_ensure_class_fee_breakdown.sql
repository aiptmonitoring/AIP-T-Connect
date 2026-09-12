alter table public.fee_class_values
  add column if not exists official_fee numeric(12, 2),
  add column if not exists attorney_fee numeric(12, 2);
