-- Preserve existing items and allow explicit fee-page pricing modes.
alter table public.quotation_items
  add column if not exists class_pricing_rows jsonb not null default '[]'::jsonb;

alter table public.quotation_items drop constraint if exists quotation_items_class_type_check;
alter table public.quotation_items add constraint quotation_items_class_type_check
  check (class_type is null or class_type in ('Single', 'Multi', 'Per Mark', 'Per Class', 'Per mark per class', 'Multi-class', 'Up to 3 classes', 'Up to 5 classes'));

notify pgrst, 'reload schema';
