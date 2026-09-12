drop index if exists public.services_list_index;
drop index if exists public.services_name_active_unique;

alter table public.services rename column name to service;
alter table public.services rename column display_color to color;

alter table public.services
  drop column category,
  drop column description,
  drop column status,
  drop column display_order;

create unique index services_service_active_unique
  on public.services (lower(service))
  where deleted_at is null;

create index services_list_index
  on public.services (service)
  where deleted_at is null;
