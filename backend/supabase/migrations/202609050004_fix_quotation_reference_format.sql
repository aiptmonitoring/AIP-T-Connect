create or replace function public.next_quotation_reference(
  p_category text,
  p_country_id uuid
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  prefix text := case p_category
    when 'Trademark' then 'T'
    when 'Patent' then 'P'
    when 'Design' then 'D'
    when 'Copyright' then 'C'
    else 'O'
  end;
  country_abbreviation text;
  current_year integer := extract(year from current_date)::integer;
  sequence_number integer;
begin
  select upper(abbreviation) into country_abbreviation
    from public.countries
   where id = p_country_id and deleted_at is null;
  if country_abbreviation is null then
    raise exception 'The quotation country is invalid.';
  end if;
  insert into public.quotation_reference_counters(reference_year, category_prefix, next_sequence)
  values (current_year, prefix, 6002)
  on conflict (reference_year, category_prefix)
  do update set next_sequence = quotation_reference_counters.next_sequence + 1
  returning next_sequence - 1 into sequence_number;
  return format('%s-%s-%s-%s', prefix, current_year, sequence_number, country_abbreviation);
end;
$$;

update public.quotations
   set reference_no = regexp_replace(reference_no, '^([A-Z])-([0-9]{4})-([0-9]+) ([A-Z]{2,3})$', '\1-\2-\3-\4')
 where reference_no ~ '^[A-Z]-[0-9]{4}-[0-9]+ [A-Z]{2,3}$';