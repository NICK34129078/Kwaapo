-- =============================================================================
-- get_personalized_feed: batch / infinite scroll support
--
-- Nieuwe signatuur:
--   public.get_personalized_feed(
--     p_limit integer default 10,
--     p_exclude_post_ids uuid[] default '{}'::uuid[]
--   ) returns setof public.posts
--
-- WAARSCHUWING: onderstaande body is een REFERENTIE (nieuwste posts eerst +
-- exclude lijst + recent user_post_view_state). Vervang ORDER BY / filters door
-- jouw bestaande ranking-logica uit je huidige functie (pg_get_functiondef).
--
-- Voer eerst uit (pas types aan indien nodig):
--   DROP FUNCTION IF EXISTS public.get_personalized_feed(integer);
--   DROP FUNCTION IF EXISTS public.get_personalized_feed(integer, uuid[]);
-- =============================================================================

drop function if exists public.get_personalized_feed(integer);
drop function if exists public.get_personalized_feed(integer, uuid[]);

create or replace function public.get_personalized_feed(
  p_limit integer default 10,
  p_exclude_post_ids uuid[] default '{}'::uuid[]
)
returns setof public.posts
language sql
stable
security definer
set search_path = public
as $$
  select p.*
  from public.posts p
  where coalesce(p.is_deleted, false) = false
    and coalesce(p.type, 'video') = 'video'
    and not (
      p.id = any (coalesce(p_exclude_post_ids, '{}'::uuid[]))
    )
    and not exists (
      select 1
      from public.user_post_view_state ups
      where ups.user_id = auth.uid()
        and ups.post_id = p.id
    )
  order by p.created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$$;

grant execute on function public.get_personalized_feed(integer, uuid[]) to authenticated;

notify pgrst, 'reload schema';
