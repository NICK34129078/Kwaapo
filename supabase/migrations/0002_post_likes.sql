-- Persistent likes per post (Reels). Run in Supabase → SQL editor if migrations CLI niet gebruikt wordt.
-- Vereist: public.posts(id) bestaat; Supabase Auth (auth.users).

create table if not exists public.post_likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create index if not exists post_likes_user_id_idx on public.post_likes (user_id);
create index if not exists post_likes_post_id_idx on public.post_likes (post_id);

alter table public.post_likes enable row level security;

-- Alleen eigen like-rijen lezen (hydratie “heb ik geliket?”).
create policy "Users select own post likes"
  on public.post_likes
  for select
  to authenticated
  using (auth.uid() = user_id);

-- Alleen eigen user_id inserten.
create policy "Users insert own post likes"
  on public.post_likes
  for insert
  to authenticated
  with check (auth.uid() = user_id);

-- Alleen eigen rijen verwijderen.
create policy "Users delete own post likes"
  on public.post_likes
  for delete
  to authenticated
  using (auth.uid() = user_id);

-- Houdt public.posts.likes_count synchroon met het aantal rijen in post_likes (globaal zichtbaar via posts).
create or replace function public.sync_post_likes_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.posts
    set likes_count = likes_count + 1
    where id = new.post_id;
    return new;
  elsif tg_op = 'DELETE' then
    update public.posts
    set likes_count = greatest(0, likes_count - 1)
    where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$;

drop trigger if exists post_likes_after_insert_delete on public.post_likes;

create trigger post_likes_after_insert_delete
  after insert or delete on public.post_likes
  for each row
  execute function public.sync_post_likes_count();
