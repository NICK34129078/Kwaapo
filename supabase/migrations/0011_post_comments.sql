-- Post comments (basis). Run in Supabase SQL editor if migrations CLI niet gebruikt wordt.

alter table public.posts
  add column if not exists comments_count integer not null default 0;

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now(),
  is_deleted boolean not null default false
);

create index if not exists post_comments_post_created_idx
  on public.post_comments (post_id, created_at desc);

create index if not exists post_comments_user_created_idx
  on public.post_comments (user_id, created_at desc);

alter table public.post_comments enable row level security;

create policy "Authenticated read non-deleted comments"
  on public.post_comments
  for select
  to authenticated
  using (is_deleted = false);

create policy "Users insert own comments"
  on public.post_comments
  for insert
  to authenticated
  with check (user_id = auth.uid());

create or replace function public.add_post_comment(
  p_post_id uuid,
  p_body text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_body text;
  v_comment_id uuid;
  v_created_at timestamptz;
begin
  if v_uid is null then
    raise exception 'Not authenticated';
  end if;

  v_body := left(trim(coalesce(p_body, '')), 300);
  if length(v_body) = 0 then
    return jsonb_build_object('success', false, 'reason', 'empty_body');
  end if;

  if not exists (
    select 1
    from public.posts p
    where p.id = p_post_id
      and coalesce(p.is_deleted, false) = false
  ) then
    return jsonb_build_object('success', false, 'reason', 'post_not_found');
  end if;

  insert into public.post_comments (post_id, user_id, body)
  values (p_post_id, v_uid, v_body)
  returning id, created_at into v_comment_id, v_created_at;

  update public.posts
  set comments_count = coalesce(comments_count, 0) + 1
  where id = p_post_id;

  return jsonb_build_object(
    'success', true,
    'id', v_comment_id,
    'post_id', p_post_id,
    'user_id', v_uid,
    'body', v_body,
    'created_at', v_created_at
  );
end;
$$;

revoke all on function public.add_post_comment(uuid, text) from public;
grant execute on function public.add_post_comment(uuid, text) to authenticated;

notify pgrst, 'reload schema';
