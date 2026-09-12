alter table public.projects add column if not exists image_path text;
alter table public.projects alter column applicant drop not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('project-images', 'project-images', false, 2097152, array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'])
on conflict (id) do update set public = false, file_size_limit = 2097152,
  allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml'];

drop policy if exists "administrators manage project images" on storage.objects;
create policy "administrators manage project images" on storage.objects
for all to authenticated using (
  bucket_id = 'project-images' and exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator')
) with check (
  bucket_id = 'project-images' and exists (select 1 from public.profiles where id = auth.uid() and role = 'administrator')
);
