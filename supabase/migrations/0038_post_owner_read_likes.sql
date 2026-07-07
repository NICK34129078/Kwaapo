-- Post owners may read likes on their own posts (activity feed + in-app notifications).

drop policy if exists "Post owners read likes on own posts" on public.post_likes;

create policy "Post owners read likes on own posts"
  on public.post_likes
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.posts p
      where p.id = post_id
        and p.user_id = auth.uid()
        and coalesce(p.is_deleted, false) = false
    )
  );

notify pgrst, 'reload schema';
