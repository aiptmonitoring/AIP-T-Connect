alter table public.quotation_items
  add column if not exists class_type text,
  add column if not exists class_count integer not null default 0,
  add column if not exists additional_fee_per_class numeric(12, 2) not null default 0;

alter table public.quotation_items
  drop constraint if exists quotation_items_class_type_check;

alter table public.quotation_items
  add constraint quotation_items_class_type_check
  check (class_type is null or class_type in ('Single', 'Multi'));

alter table public.quotation_items
  drop constraint if exists quotation_items_class_count_check;

alter table public.quotation_items
  add constraint quotation_items_class_count_check
  check (class_count >= 0 and class_count <= 45);

alter table public.quotation_items
  drop constraint if exists quotation_items_additional_fee_check;

alter table public.quotation_items
  add constraint quotation_items_additional_fee_check
  check (additional_fee_per_class >= 0);