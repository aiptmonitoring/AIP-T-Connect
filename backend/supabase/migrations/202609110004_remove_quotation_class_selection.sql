alter table public.quotation_items
  drop column if exists class_type,
  drop column if exists class_count,
  drop column if exists class_input,
  drop column if exists additional_fee_per_class,
  drop column if exists class_charge;
