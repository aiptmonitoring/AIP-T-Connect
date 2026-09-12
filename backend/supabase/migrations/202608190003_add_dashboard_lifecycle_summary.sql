-- Dashboard metrics are based on immutable, dated application milestones.
-- The project row remains the operational record; this table is the analytic
-- source of truth for daily and monthly lifecycle reporting.
alter table public.projects
  add column if not exists opposition_date date;

create index if not exists projects_filing_date_active_index
  on public.projects (filing_date)
  where deleted_at is null and filing_date is not null;
create index if not exists projects_acceptance_date_active_index
  on public.projects (acceptance_date)
  where deleted_at is null and acceptance_date is not null;
create index if not exists projects_opposition_date_active_index
  on public.projects (opposition_date)
  where deleted_at is null and opposition_date is not null;
create index if not exists projects_registered_date_active_index
  on public.projects (registered_date)
  where deleted_at is null and registered_date is not null;
create index if not exists clients_created_at_active_index
  on public.clients (created_at)
  where deleted_at is null;

create table if not exists public.project_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id),
  event_type varchar(20) not null check (event_type in ('filed', 'accepted', 'opposition', 'registered')),
  occurred_on date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create unique index if not exists project_lifecycle_events_active_unique
  on public.project_lifecycle_events (project_id, event_type)
  where deleted_at is null;
create index if not exists project_lifecycle_events_dashboard_index
  on public.project_lifecycle_events (occurred_on, event_type, project_id)
  where deleted_at is null;

drop trigger if exists project_lifecycle_events_set_updated_at on public.project_lifecycle_events;
create trigger project_lifecycle_events_set_updated_at
  before update on public.project_lifecycle_events
  for each row execute procedure public.set_updated_at();

alter table public.project_lifecycle_events enable row level security;

create or replace function public.sync_project_lifecycle_events()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.deleted_at is not null then
    update public.project_lifecycle_events
       set deleted_at = coalesce(deleted_at, now())
     where project_id = new.id
       and deleted_at is null;
    return new;
  end if;

  insert into public.project_lifecycle_events as lifecycle_event (project_id, event_type, occurred_on)
  values (new.id, 'filed', coalesce(new.filing_date, new.matter_date))
  on conflict (project_id, event_type) where deleted_at is null
  do update set occurred_on = excluded.occurred_on, updated_at = now();

  if new.acceptance_date is not null then
    insert into public.project_lifecycle_events as lifecycle_event (project_id, event_type, occurred_on)
    values (new.id, 'accepted', new.acceptance_date)
    on conflict (project_id, event_type) where deleted_at is null
    do update set occurred_on = excluded.occurred_on, updated_at = now();
  else
    update public.project_lifecycle_events
       set deleted_at = coalesce(deleted_at, now())
     where project_id = new.id
       and event_type = 'accepted'
       and deleted_at is null;
  end if;

  if new.opposition_date is not null then
    insert into public.project_lifecycle_events as lifecycle_event (project_id, event_type, occurred_on)
    values (new.id, 'opposition', new.opposition_date)
    on conflict (project_id, event_type) where deleted_at is null
    do update set occurred_on = excluded.occurred_on, updated_at = now();
  else
    update public.project_lifecycle_events
       set deleted_at = coalesce(deleted_at, now())
     where project_id = new.id
       and event_type = 'opposition'
       and deleted_at is null;
  end if;

  if new.registered_date is not null then
    insert into public.project_lifecycle_events as lifecycle_event (project_id, event_type, occurred_on)
    values (new.id, 'registered', new.registered_date)
    on conflict (project_id, event_type) where deleted_at is null
    do update set occurred_on = excluded.occurred_on, updated_at = now();
  else
    update public.project_lifecycle_events
       set deleted_at = coalesce(deleted_at, now())
     where project_id = new.id
       and event_type = 'registered'
       and deleted_at is null;
  end if;

  return new;
end;
$$;

drop trigger if exists projects_sync_lifecycle_events on public.projects;
create trigger projects_sync_lifecycle_events
  after insert or update of matter_date, filing_date, acceptance_date, opposition_date, registered_date, deleted_at
  on public.projects
  for each row execute procedure public.sync_project_lifecycle_events();

-- Bring the existing application data into the same lifecycle source. An
-- opposition is intentionally not guessed: it appears once an Opposition Date
-- is recorded in the application editor.
insert into public.project_lifecycle_events (project_id, event_type, occurred_on)
select id, 'filed', coalesce(filing_date, matter_date)
  from public.projects
 where deleted_at is null
on conflict (project_id, event_type) where deleted_at is null
do update set occurred_on = excluded.occurred_on, updated_at = now();

insert into public.project_lifecycle_events (project_id, event_type, occurred_on)
select id, 'accepted', acceptance_date
  from public.projects
 where deleted_at is null and acceptance_date is not null
on conflict (project_id, event_type) where deleted_at is null
do update set occurred_on = excluded.occurred_on, updated_at = now();

insert into public.project_lifecycle_events (project_id, event_type, occurred_on)
select id, 'opposition', opposition_date
  from public.projects
 where deleted_at is null and opposition_date is not null
on conflict (project_id, event_type) where deleted_at is null
do update set occurred_on = excluded.occurred_on, updated_at = now();

insert into public.project_lifecycle_events (project_id, event_type, occurred_on)
select id, 'registered', registered_date
  from public.projects
 where deleted_at is null and registered_date is not null
on conflict (project_id, event_type) where deleted_at is null
do update set occurred_on = excluded.occurred_on, updated_at = now();

create or replace function public.dashboard_summary(
  p_as_of_date date,
  p_month_count integer,
  p_recent_page integer,
  p_recent_page_size integer,
  p_recent_search text default ''
)
returns jsonb
language sql
stable
set search_path = public
as $$
  with params as (
    select
      p_as_of_date as as_of_date,
      greatest(3, least(coalesce(p_month_count, 12), 24)) as month_count,
      greatest(1, coalesce(p_recent_page, 1)) as recent_page,
      greatest(1, least(coalesce(p_recent_page_size, 10), 50)) as recent_page_size,
      coalesce(nullif(trim(p_recent_search), ''), '') as recent_search
  ),
  lifecycle_events as (
    select event.project_id, event.event_type, event.occurred_on
      from public.project_lifecycle_events event
      join public.projects project
        on project.id = event.project_id
       and project.deleted_at is null
     where event.deleted_at is null
  ),
  daily_event_counts as (
    select
      event_type,
      count(*) filter (where occurred_on = params.as_of_date)::integer as current_count,
      count(*) filter (where occurred_on = params.as_of_date - 1)::integer as previous_count
      from lifecycle_events
      cross join params
     where event_type in ('filed', 'accepted', 'opposition', 'registered')
     group by event_type
  ),
  daily_metrics as (
    select
      expected.event_type,
      coalesce(counts.current_count, 0) as current_count,
      coalesce(counts.previous_count, 0) as previous_count
      from (values ('filed'), ('accepted'), ('opposition'), ('registered')) as expected(event_type)
      left join daily_event_counts counts using (event_type)
  ),
  daily_metric_json as (
    select jsonb_object_agg(
      event_type,
      jsonb_build_object(
        'count', current_count,
        'previous_day_count', previous_count,
        'delta', current_count - previous_count,
        'percent_change', case
          when previous_count = 0 then null
          else round(((current_count - previous_count)::numeric / previous_count) * 100, 1)
        end
      )
    ) as value
      from daily_metrics
  ),
  months as (
    select series::date as month_start
      from params,
      generate_series(
        date_trunc('month', params.as_of_date) - ((params.month_count - 1) * interval '1 month'),
        date_trunc('month', params.as_of_date),
        interval '1 month'
      ) as series
  ),
  monthly_values as (
    select
      months.month_start,
      count(event.project_id) filter (where event.event_type = 'filed')::integer as filed,
      count(event.project_id) filter (where event.event_type = 'accepted')::integer as accepted,
      count(event.project_id) filter (where event.event_type = 'opposition')::integer as opposition,
      count(event.project_id) filter (where event.event_type = 'registered')::integer as registered
      from months
      left join lifecycle_events event
        on event.occurred_on >= months.month_start
       and event.occurred_on < (months.month_start + interval '1 month')::date
     group by months.month_start
  ),
  project_performance_json as (
    select jsonb_agg(
      jsonb_build_object(
        'month', to_char(month_start, 'YYYY-MM'),
        'label', to_char(month_start, 'Mon'),
        'filed', filed,
        'accepted', accepted,
        'opposition', opposition,
        'registered', registered
      ) order by month_start
    ) as value
      from monthly_values
  ),
  portfolio as (
    select
      (select count(*)::integer from public.clients client where client.deleted_at is null and client.status = 'Active') as active_clients,
      (select count(*)::integer from public.clients client cross join params where client.deleted_at is null and client.created_at::date between date_trunc('month', params.as_of_date)::date and params.as_of_date) as new_clients,
      (select count(*)::integer from public.projects project where project.deleted_at is null) as active_projects,
      (select count(*)::integer from public.projects project cross join params where project.deleted_at is null and project.matter_date between date_trunc('month', params.as_of_date)::date and params.as_of_date) as new_projects,
      (select count(*)::integer from public.project_timelines timeline cross join params where timeline.deleted_at is null and timeline.timeline_date between date_trunc('month', params.as_of_date)::date and params.as_of_date) as timeline_updates,
      (select count(*)::integer from public.project_timeline_documents document cross join params where document.deleted_at is null and document.created_at::date between date_trunc('month', params.as_of_date)::date and params.as_of_date) as documents_uploaded,
      (select count(*)::integer from lifecycle_events event cross join params where event.event_type = 'filed' and event.occurred_on between date_trunc('month', params.as_of_date)::date and params.as_of_date) as filed_events,
      (select count(*)::integer from lifecycle_events event cross join params where event.event_type = 'accepted' and event.occurred_on between date_trunc('month', params.as_of_date)::date and params.as_of_date) as accepted_events,
      (select count(*)::integer from lifecycle_events event cross join params where event.event_type = 'opposition' and event.occurred_on between date_trunc('month', params.as_of_date)::date and params.as_of_date) as opposition_events,
      (select count(*)::integer from lifecycle_events event cross join params where event.event_type = 'registered' and event.occurred_on between date_trunc('month', params.as_of_date)::date and params.as_of_date) as registered_events
  ),
  business_performance_json as (
    select jsonb_build_object(
      'period', jsonb_build_object(
        'start', date_trunc('month', params.as_of_date)::date,
        'end', params.as_of_date
      ),
      'portfolio', jsonb_build_object(
        'active_clients', portfolio.active_clients,
        'new_clients', portfolio.new_clients,
        'active_projects', portfolio.active_projects,
        'new_projects', portfolio.new_projects,
        'timeline_updates', portfolio.timeline_updates,
        'documents_uploaded', portfolio.documents_uploaded
      ),
      'lifecycle_rates', jsonb_build_object(
        'acceptance_rate', jsonb_build_object('numerator', portfolio.accepted_events, 'denominator', portfolio.filed_events, 'value', case when portfolio.filed_events = 0 then null else round((portfolio.accepted_events::numeric / portfolio.filed_events) * 100, 1) end),
        'opposition_rate', jsonb_build_object('numerator', portfolio.opposition_events, 'denominator', portfolio.filed_events, 'value', case when portfolio.filed_events = 0 then null else round((portfolio.opposition_events::numeric / portfolio.filed_events) * 100, 1) end),
        'registration_rate', jsonb_build_object('numerator', portfolio.registered_events, 'denominator', portfolio.filed_events, 'value', case when portfolio.filed_events = 0 then null else round((portfolio.registered_events::numeric / portfolio.filed_events) * 100, 1) end)
      )
    ) as value
      from portfolio
      cross join params
  ),
  recent_filtered as (
    select
      project.id,
      project.aipt_ref_no,
      project.client_ref_no,
      project.project_name,
      project.matter_type,
      project.status,
      project.filing_date,
      project.renewal_date,
      project.updated_at,
      client.id as client_id,
      client.assigned_id as client_assigned_id,
      client.company_name as client_company_name,
      country.id as country_id,
      country.name as country_name,
      country.abbreviation as country_abbreviation,
      country.flag_url as country_flag_url,
      service.id as service_id,
      service.service as service_name,
      service.color as service_color,
      procedure.id as procedure_id,
      procedure.description as procedure_description,
      latest_timeline.id as latest_timeline_id,
      latest_timeline.timeline_date as latest_timeline_date,
      latest_procedure.description as latest_timeline_procedure
      from public.projects project
      join public.clients client on client.id = project.client_id and client.deleted_at is null
      join public.countries country on country.id = project.country_id and country.deleted_at is null
      join public.services service on service.id = project.service_id and service.deleted_at is null
      join public.procedures procedure on procedure.id = project.procedure_id and procedure.deleted_at is null
      left join lateral (
        select timeline.id, timeline.procedure_id, timeline.timeline_date
          from public.project_timelines timeline
         where timeline.project_id = project.id
           and timeline.deleted_at is null
         order by timeline.timeline_date desc, timeline.created_at desc
         limit 1
      ) latest_timeline on true
      left join public.procedures latest_procedure on latest_procedure.id = latest_timeline.procedure_id and latest_procedure.deleted_at is null
      cross join params
     where project.deleted_at is null
       and (
         params.recent_search = ''
         or project.aipt_ref_no ilike '%' || params.recent_search || '%'
         or project.client_ref_no ilike '%' || params.recent_search || '%'
         or project.project_name ilike '%' || params.recent_search || '%'
         or client.company_name ilike '%' || params.recent_search || '%'
       )
  ),
  recent_total as (
    select count(*)::integer as value from recent_filtered
  ),
  recent_rows as (
    select *
      from recent_filtered
     order by updated_at desc, id desc
     offset (select (recent_page - 1) * recent_page_size from params)
     limit (select recent_page_size from params)
  ),
  recent_projects_json as (
    select coalesce(jsonb_agg(
      jsonb_build_object(
        'id', id,
        'aipt_ref_no', aipt_ref_no,
        'client_ref_no', client_ref_no,
        'project_name', project_name,
        'matter_type', matter_type,
        'status', status,
        'filing_date', filing_date,
        'renewal_date', renewal_date,
        'client', jsonb_build_object('id', client_id, 'assigned_id', client_assigned_id, 'company_name', client_company_name),
        'country', jsonb_build_object('id', country_id, 'name', country_name, 'abbreviation', country_abbreviation, 'flag_url', country_flag_url),
        'service', jsonb_build_object('id', service_id, 'service', service_name, 'color', service_color),
        'procedure', jsonb_build_object('id', procedure_id, 'description', procedure_description),
        'latest_timeline', case when latest_timeline_id is null then null else jsonb_build_object('id', latest_timeline_id, 'procedure', latest_timeline_procedure, 'timeline_date', latest_timeline_date) end
      ) order by updated_at desc, id desc
    ), '[]'::jsonb) as value
      from recent_rows
  )
  select jsonb_build_object(
    'generated_at', now(),
    'filters', jsonb_build_object(
      'day', params.as_of_date,
      'timezone', 'Asia/Riyadh',
      'month_start', (select min(month_start) from months),
      'month_end', params.as_of_date
    ),
    'daily_totals', daily_metric_json.value,
    'project_performance', jsonb_build_object('granularity', 'month', 'series', project_performance_json.value),
    'business_performance', business_performance_json.value,
    'recent_projects', jsonb_build_object(
      'data', recent_projects_json.value,
      'total', recent_total.value,
      'page', params.recent_page,
      'page_size', params.recent_page_size
    )
  )
    from params
    cross join daily_metric_json
    cross join project_performance_json
    cross join business_performance_json
    cross join recent_projects_json
    cross join recent_total;
$$;

revoke all on function public.dashboard_summary(date, integer, integer, integer, text) from public;
grant execute on function public.dashboard_summary(date, integer, integer, integer, text) to service_role;
