-- Status remains available for legacy views and reports, but it is no longer
-- supplied by the Add/Edit Matter form. New records receive a safe default;
-- when a lifecycle date actually changes, the server derives the display value.
-- Existing rows are deliberately not rewritten, preserving their historic data.
alter table public.projects
  alter column status set default 'Filed';

create or replace function public.set_project_lifecycle_status()
returns trigger
language plpgsql
as $$
begin
  -- On an insert, status is always initialized from the lifecycle dates. On an
  -- update, preserve historic status unless a lifecycle date truly changed.
  if tg_op <> 'INSERT' then
    if new.filing_date is not distinct from old.filing_date
      and new.acceptance_date is not distinct from old.acceptance_date
      and new.opposition_date is not distinct from old.opposition_date
      and new.registered_date is not distinct from old.registered_date then
      return new;
    end if;
  end if;

  new.status := case
    when new.registered_date is not null then 'Registered'
    when new.opposition_date is not null then 'Opposition'
    when new.acceptance_date is not null then 'Accepted'
    else 'Filed'
  end;

  return new;
end;
$$;

drop trigger if exists projects_set_lifecycle_status on public.projects;
create trigger projects_set_lifecycle_status
  before insert or update of filing_date, acceptance_date, opposition_date, registered_date
  on public.projects
  for each row execute procedure public.set_project_lifecycle_status();

comment on column public.projects.status is
  'Legacy display field. The server derives it from lifecycle dates; application forms do not submit it.';
