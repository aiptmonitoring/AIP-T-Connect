alter table public.quotations
  add column if not exists client_matter_ref text,
  add column if not exists invoice_date date not null default current_date,
  add column if not exists subject text not null default '',
  add column if not exists currency text not null default 'USD' check (currency = 'USD'),
  add column if not exists vatable boolean not null default true;

alter table public.quotations
  add constraint quotations_invoice_date_check check (invoice_date is not null);

alter table public.quotation_items
  add column if not exists class_input text;
