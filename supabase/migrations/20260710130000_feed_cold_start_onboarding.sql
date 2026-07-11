-- Cold-start onboarding: interest (tag) seeding voor nieuwe gebruikers
-- (feed_plan.md gap #3).
--
-- get_personalized_feed geeft ook zonder voorkeuren content terug (engagement/
-- freshness/exploration), dus niemand "valt naar explore" — maar de eerste
-- sessie is generiek. Door bij onboarding een paar interesses te laten kiezen
-- seeden we user_tag_preferences zodat de allereerste personalized-feed al
-- gericht is. Hergebruikt apply_tag_preference (geclampt), net als like/save.

-- 1) Vlag zodat de picker maar één keer verschijnt (ook na 'overslaan').
alter table public.profiles
  add column if not exists feed_interests_seeded_at timestamptz;

-- 2) Populaire tags als keuze-opties (data-gedreven, laatste 90 dagen).
create or replace function public.get_popular_feed_tags(
  p_limit integer default 24
)
returns table(tag text, usage_count integer)
language sql
stable
security definer
set search_path = public
as $$
  select t.tag, count(*)::integer as usage_count
  from (
    select lower(trim(tg)) as tag
    from public.posts p
    cross join lateral unnest(coalesce(p.tags, '{}'::text[])) as tg
    where coalesce(p.is_deleted, false) = false
      and coalesce(p.type, 'video') in ('video', 'image_carousel')
      and p.created_at > now() - interval '90 days'
  ) t
  where t.tag <> ''
  group by t.tag
  order by usage_count desc, t.tag asc
  limit least(greatest(coalesce(p_limit, 24), 1), 50);
$$;

grant execute on function public.get_popular_feed_tags(integer) to authenticated;

-- 3) Moet de onboarding-picker getoond worden? Alleen echte cold-start:
--    nog niet geseed/overgeslagen én nog geen enkele tag-voorkeur opgebouwd.
create or replace function public.needs_feed_interest_onboarding()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    auth.uid() is not null
    and coalesce(
      (select p.feed_interests_seeded_at is null
       from public.profiles p where p.id = auth.uid()),
      false
    )
    and not exists (
      select 1 from public.user_tag_preferences utp
      where utp.user_id = auth.uid()
    );
$$;

grant execute on function public.needs_feed_interest_onboarding() to authenticated;

-- 4) Seed de gekozen interesses. Idempotent-veilig: geclampt via
--    apply_tag_preference, gededupe, en begrensd op 20 tags. Zet altijd de vlag
--    (ook bij 0 tags = overslaan) zodat de picker niet terugkomt.
create or replace function public.seed_feed_interests(
  p_tags text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_tag text;
  v_norm text;
  v_seen text[] := '{}';
  v_seeded integer := 0;
begin
  if v_user is null then
    raise exception 'Not authenticated';
  end if;

  if p_tags is not null then
    foreach v_tag in array p_tags loop
      v_norm := regexp_replace(lower(trim(coalesce(v_tag, ''))), '[^a-z0-9_]', '', 'g');
      if v_norm = '' or v_norm = any(v_seen) then
        continue;
      end if;
      v_seen := array_append(v_seen, v_norm);
      -- Expliciete interesse: sterker dan een like (±4), zwakker dan een follow
      -- (±15). +12 stuurt de eerste sessie zonder de latere learning te overheersen.
      perform public.apply_tag_preference(v_user, v_norm, 12, 1, 0, 0);
      v_seeded := v_seeded + 1;
      exit when v_seeded >= 20;
    end loop;
  end if;

  update public.profiles
  set feed_interests_seeded_at = now()
  where id = v_user;

  return jsonb_build_object('success', true, 'seeded', v_seeded);
end;
$$;

grant execute on function public.seed_feed_interests(text[]) to authenticated;

notify pgrst, 'reload schema';
