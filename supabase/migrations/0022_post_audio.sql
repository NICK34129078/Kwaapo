-- Optional audio metadata for image carousel / slideshow posts

alter table public.posts
  add column if not exists audio_url text null;

alter table public.posts
  add column if not exists audio_title text null;

alter table public.posts
  add column if not exists audio_artist text null;

alter table public.posts
  add column if not exists audio_source text null default 'none';

alter table public.posts
  add column if not exists audio_start_ms int not null default 0;

alter table public.posts
  add column if not exists audio_volume numeric(4, 2) not null default 1.00;

alter table public.posts
  add column if not exists audio_duration_ms int null;

update public.posts
set audio_source = 'none'
where audio_source is null;

alter table public.posts
  alter column audio_source set not null;

alter table public.posts
  alter column audio_source set default 'none';

drop constraint if exists posts_audio_source_check on public.posts;

alter table public.posts
  add constraint posts_audio_source_check
  check (audio_source in ('none', 'user_upload', 'app_library', 'external'));

drop constraint if exists posts_audio_start_ms_check on public.posts;

alter table public.posts
  add constraint posts_audio_start_ms_check
  check (audio_start_ms >= 0);

drop constraint if exists posts_audio_volume_check on public.posts;

alter table public.posts
  add constraint posts_audio_volume_check
  check (audio_volume >= 0 and audio_volume <= 1);

comment on column public.posts.audio_url is
  'Public URL to optional slideshow audio (Supabase storage post-audio bucket).';

comment on column public.posts.audio_source is
  'none | user_upload | app_library | external';

-- Storage bucket for user-uploaded post audio (public read)
insert into storage.buckets (id, name, public)
values ('post-audio', 'post-audio', true)
on conflict (id) do nothing;

drop policy if exists "Public read post audio" on storage.objects;

create policy "Public read post audio"
  on storage.objects
  for select
  using (bucket_id = 'post-audio');

drop policy if exists "Owners upload post audio" on storage.objects;

create policy "Owners upload post audio"
  on storage.objects
  for insert
  with check (
    bucket_id = 'post-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Owners update post audio" on storage.objects;

create policy "Owners update post audio"
  on storage.objects
  for update
  using (
    bucket_id = 'post-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  )
  with check (
    bucket_id = 'post-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "Owners delete post audio" on storage.objects;

create policy "Owners delete post audio"
  on storage.objects
  for delete
  using (
    bucket_id = 'post-audio'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
