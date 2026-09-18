-- Align the deployed cart contract without replaying the historical
-- drop-and-recreate class migration, which would erase existing class data.
begin;
alter table public.quotation_items
  add column if not exists quantity integer not null default 1 check (quantity >= 1),
  add column if not exists class_numbers smallint[] not null default '{}';
alter table public.quotation_items
  drop constraint if exists quotation_items_class_numbers_check;
alter table public.quotation_items
  add constraint quotation_items_class_numbers_check
  check (class_numbers <@ array[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29,30,31,32,33,34,35,36,37,38,39,40,41,42,43,44,45]::smallint[]);
alter table public.quotation_items
  drop constraint if exists quotation_items_class_count_check;
alter table public.quotation_items
  add constraint quotation_items_class_count_check
  check (class_count is null or (class_count >= 0 and class_count <= 45));
notify pgrst, 'reload schema';
commit;
