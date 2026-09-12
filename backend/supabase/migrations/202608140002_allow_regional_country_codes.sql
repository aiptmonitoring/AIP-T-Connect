alter table public.countries drop constraint if exists countries_abbreviation_check;
alter table public.countries add constraint countries_abbreviation_check check (abbreviation ~ '^[A-Z]{2,5}$');
