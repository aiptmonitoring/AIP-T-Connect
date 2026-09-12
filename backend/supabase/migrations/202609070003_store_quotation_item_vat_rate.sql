alter table public.quotation_items
  add column if not exists vat_rate numeric(7, 4) not null default 0 check (vat_rate >= 0 and vat_rate <= 100);