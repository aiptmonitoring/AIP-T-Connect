create or replace function public.mark_multi_country_quotation_reference()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  country_count integer;
begin
  select count(distinct country_id) into country_count
    from public.quotation_items
   where quotation_id = new.quotation_id;
  if country_count > 1 then
    update public.quotations
       set reference_no = regexp_replace(reference_no, '[A-Z]{2,3}$', 'INT')
     where id = new.quotation_id
       and reference_no !~ 'INT$';
  end if;
  return new;
end;
$$;

drop trigger if exists quotation_items_multi_country_reference on public.quotation_items;
create trigger quotation_items_multi_country_reference
after insert on public.quotation_items
for each row execute procedure public.mark_multi_country_quotation_reference();
