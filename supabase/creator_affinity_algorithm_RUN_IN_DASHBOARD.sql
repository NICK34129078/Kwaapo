-- =============================================================================
-- creator_affinity_algorithm_RUN_IN_DASHBOARD.sql
-- RUN IN SUPABASE SQL EDITOR (niet via supabase db push)
--
-- Doel: Creator/account affinity scoring als extra laag bovenop het
-- bestaande hashtag/completion ranking algoritme.
--
-- Bevat (in volgorde):
--   1. Tabel public.user_creator_preferences
--   2. Indexes
--   3. RLS policies
--   4. Helper: public.apply_creator_affinity(...)
--   5. Follow trigger: follows INSERT/DELETE → affinity bijwerken
--   6. Bijgewerkt: public.apply_post_like_preference (like/unlike → affinity)
--   7. Bijgewerkt: public.record_video_view (view/completion → affinity)
--   8. Bijgewerkt: public.get_personalized_feed (creator affinity in ranking)
--   9. Grants + notify
--
-- Aannames schema:
--   posts.user_id            TEXT  (niet uuid)
--   follows.follower_id      UUID
--   follows.following_id     UUID  (cast ::text = posts.user_id)
--   auth.uid()               UUID
--
-- BACKUP INSTRUCTIES (voer uit VOORDAT je dit script draait):
--
--   -- Huidige get_personalized_feed:
--   select pg_get_functiondef(
--     'public.get_personalized_feed(integer, uuid[])'::regprocedure
--   );
--
--   -- Huidige record_video_view:
--   select pg_get_functiondef(
--     'public.record_video_view(uuid,integer,integer,numeric,boolean)'::regprocedure
--   );
--
--   -- Huidige apply_post_like_preference:
--   select pg_get_functiondef(
--     'public.apply_post_like_preference(uuid,boolean)'::regprocedure
--   );
--
-- ROLLBACK: plak de outputs van bovenstaande queries terug en voer opnieuw uit.
--
-- record_video_view:
--   Volledig gemerged uit record_video_view_server_cap_RUN_IN_DASHBOARD.sql
--   + last_viewed_at bij user_post_view_state (nodig voor 7-dagenregel in feed)
--   + creator affinity updates (nieuw)
--   Als jouw live backup EXTRA logica heeft (duplicate-check, tag-scoring):
--   vergelijk eerst met backup en plak die terug vóór INSERT video_views.
--
-- DROP vóór CREATE (veilig bij return-type/signature wijzigingen):
--   apply_post_like_preference, record_video_view, get_personalized_feed
-- =============================================================================


-- =============================================================================
-- SECTIE 1: TABEL user_creator_preferences
-- =============================================================================

create table if not exists public.user_creator_preferences (
  user_id                 uuid    not null references auth.users (id) on delete cascade,
  creator_id              text    not null,
  score                   numeric not null default 0,
  views_count             integer not null default 0,
  completed_views_count   integer not null default 0,
  likes_count             integer not null default 0,
  follows_count           integer not null default 0,
  last_interaction_at     timestamptz not null default now(),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint user_creator_preferences_pkey primary key (user_id, creator_id)
);


-- =============================================================================
-- SECTIE 2: INDEXES
-- =============================================================================

create index if not exists user_creator_preferences_user_score_idx
  on public.user_creator_preferences (user_id, score desc);

create index if not exists user_creator_preferences_creator_idx
  on public.user_creator_preferences (creator_id);


-- =============================================================================
-- SECTIE 3: RLS
-- =============================================================================

alter table public.user_creator_preferences enable row level security;

drop policy if exists "Users select own creator preferences"
  on public.user_creator_preferences;
create policy "Users select own creator preferences"
  on public.user_creator_preferences
  for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "Users upsert own creator preferences"
  on public.user_creator_preferences;
create policy "Users upsert own creator preferences"
  on public.user_creator_preferences
  for all
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- service_role bypast RLS; geen extra policy nodig.


-- =============================================================================
-- SECTIE 4: HELPER public.apply_creator_affinity
--
-- Aanroepen bij:
--   - video bekijken  → record_video_view
--   - like / unlike   → apply_post_like_preference
--   - follow / unfollow → trigger op follows tabel (Sectie 5)
--
-- Clamp: score tussen -50 en +100 (voorkomt explosie).
-- Self-affinity wordt altijd genegeerd (user_id != creator_id).
-- =============================================================================

create or replace function public.apply_creator_affinity(
  p_viewer_id       uuid,     -- auth.uid() van de kijker / liker
  p_creator_id      text,     -- posts.user_id van de creator
  p_score_delta     numeric,  -- punten toe te voegen (negatief = aftrekken)
  p_views_delta           integer default 0,
  p_completed_delta       integer default 0,
  p_likes_delta           integer default 0,
  p_follows_delta         integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_clamp_min constant numeric := -50;
  v_clamp_max constant numeric := 100;
begin
  -- Eigen content telt nooit mee voor affinity
  if p_viewer_id::text = p_creator_id then
    return;
  end if;

  -- Niets te doen
  if p_score_delta = 0
     and p_views_delta = 0 and p_completed_delta = 0
     and p_likes_delta = 0 and p_follows_delta = 0 then
    return;
  end if;

  insert into public.user_creator_preferences (
    user_id,
    creator_id,
    score,
    views_count,
    completed_views_count,
    likes_count,
    follows_count,
    last_interaction_at,
    updated_at
  )
  values (
    p_viewer_id,
    p_creator_id,
    least(v_clamp_max, greatest(v_clamp_min, p_score_delta)),
    greatest(0, p_views_delta),
    greatest(0, p_completed_delta),
    greatest(0, p_likes_delta),
    greatest(0, p_follows_delta),
    now(),
    now()
  )
  on conflict (user_id, creator_id) do update
    set
      score = least(
        v_clamp_max,
        greatest(
          v_clamp_min,
          user_creator_preferences.score + p_score_delta
        )
      ),
      views_count = greatest(
        0,
        user_creator_preferences.views_count + p_views_delta
      ),
      completed_views_count = greatest(
        0,
        user_creator_preferences.completed_views_count + p_completed_delta
      ),
      likes_count = greatest(
        0,
        user_creator_preferences.likes_count + p_likes_delta
      ),
      follows_count = greatest(
        0,
        user_creator_preferences.follows_count + p_follows_delta
      ),
      last_interaction_at = now(),
      updated_at          = now();
end;
$$;

grant execute on function public.apply_creator_affinity(
  uuid, text, numeric, integer, integer, integer, integer
) to authenticated;
grant execute on function public.apply_creator_affinity(
  uuid, text, numeric, integer, integer, integer, integer
) to service_role;


-- =============================================================================
-- SECTIE 5: FOLLOW TRIGGER → creator affinity
--
-- Werkt op public.follows (follower_id uuid, following_id uuid).
-- Geen client-code wijzigingen nodig: trigger vuurt automatisch.
-- Scoregewichten:
--   follow   → +15.0
--   unfollow → -15.0
-- =============================================================================

create or replace function public.trg_follows_creator_affinity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.apply_creator_affinity(
      new.follower_id,      -- viewer uuid
      new.following_id::text,  -- creator (cast uuid→text om posts.user_id te matchen)
      15.0,                 -- score delta
      0, 0, 0, 1            -- views, completed, likes, follows_delta
    );

  elsif tg_op = 'DELETE' then
    perform public.apply_creator_affinity(
      old.follower_id,
      old.following_id::text,
      -15.0,
      0, 0, 0, -1
    );
  end if;
  return null;
end;
$$;

drop trigger if exists trg_follows_creator_affinity on public.follows;
create trigger trg_follows_creator_affinity
  after insert or delete on public.follows
  for each row
  execute function public.trg_follows_creator_affinity();


-- =============================================================================
-- SECTIE 6: apply_post_like_preference (bijgewerkt)
--
-- Voegt creator affinity update toe aan de bestaande tag-preference logica.
-- Scoregewichten:
--   like   → creator affinity +5.0, likes_delta +1
--   unlike → creator affinity -5.0, likes_delta -1
-- =============================================================================

drop function if exists public.apply_post_like_preference(uuid, boolean);

create or replace function public.apply_post_like_preference(
  p_post_id  uuid,
  p_is_liked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid := auth.uid();
  v_tags      text[];
  v_creator   text;
  v_delta     integer;
  rec         record;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select coalesce(p.tags, '{}'::text[]), p.user_id
  into v_tags, v_creator
  from public.posts p
  where p.id = p_post_id;

  if not found then
    v_tags    := '{}'::text[];
    v_creator := null;
  end if;

  v_delta := case when p_is_liked then 8 else -8 end;

  -- Tag-preference update (bestaande logica uit migration 0005, ongewijzigd)
  if v_tags is null or coalesce(cardinality(v_tags), 0) = 0 then
    -- Geen tags: geen tag-preference update (zelfde als voorheen)
    -- Wel creator affinity (nieuw)
    if v_creator is not null then
      perform public.apply_creator_affinity(
        v_user_id,
        v_creator,
        case when p_is_liked then 5.0 else -5.0 end,
        0, 0,
        case when p_is_liked then 1 else -1 end,
        0
      );
    end if;

    return jsonb_build_object(
      'success', true,
      'post_id', p_post_id,
      'delta',   v_delta,
      'tags',    '[]'::jsonb
    );
  end if;

  for rec in
    select distinct unnest(v_tags) as tag
  loop
    if rec.tag is null or length(trim(rec.tag)) = 0 then
      continue;
    end if;

    insert into public.user_tag_preferences (
      user_id,
      tag,
      score,
      last_interaction_at
    )
    values (
      v_user_id,
      trim(rec.tag),
      v_delta,
      now()
    )
    on conflict (user_id, tag) do update
      set
        score               = user_tag_preferences.score + excluded.score,
        last_interaction_at = excluded.last_interaction_at;
  end loop;

  -- Creator affinity update (nieuw, na tag-preference)
  if v_creator is not null then
    perform public.apply_creator_affinity(
      v_user_id,
      v_creator,
      case when p_is_liked then 5.0 else -5.0 end,
      0, 0,
      case when p_is_liked then 1 else -1 end,
      0
    );
  end if;

  return jsonb_build_object(
    'success', true,
    'post_id', p_post_id,
    'delta',   v_delta,
    'tags',    to_jsonb(v_tags)
  );
end;
$$;

grant execute on function public.apply_post_like_preference(uuid, boolean) to authenticated;


-- =============================================================================
-- SECTIE 7: record_video_view (bijgewerkt)
--
-- Basis: record_video_view_server_cap_RUN_IN_DASHBOARD.sql (volledig gemerged)
-- Toegevoegd:
--   - last_viewed_at op user_post_view_state (7-dagenregel in get_personalized_feed)
--   - creator affinity op basis van kijkgedrag
--
-- Scoregewichten creator affinity per view:
--   Bekijken >= 500ms:    +0.5
--   Kijktijd >= 50%:      +1.0
--   Completion:           +2.0
--   Max per view:         +3.5
-- =============================================================================

drop function if exists public.record_video_view(uuid, integer, integer, numeric, boolean);

create or replace function public.record_video_view(
  p_post_id uuid,
  p_watched_ms integer,
  p_duration_ms integer,
  p_watched_percent numeric,
  p_completed boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid;
  v_watched_ms integer;
  v_watched_percent numeric;
  v_completed boolean;
  v_updated int;
  v_creator_id text;
  v_score_delta numeric;
begin
  v_uid := auth.uid();
  if v_uid is null then
    return;
  end if;

  if coalesce(p_duration_ms, 0) > 0 then
    v_watched_ms := least(greatest(coalesce(p_watched_ms, 0), 0), p_duration_ms);
  else
    v_watched_ms := least(greatest(coalesce(p_watched_ms, 0), 0), 120000);
  end if;

  if v_watched_ms < 500 then
    return;
  end if;

  if coalesce(p_duration_ms, 0) > 0 then
    v_watched_percent := least(
      100::numeric,
      greatest(
        0::numeric,
        (v_watched_ms::numeric / nullif(p_duration_ms, 0)::numeric) * 100
      )
    );
  else
    v_watched_percent := p_watched_percent;
  end if;

  v_completed := coalesce(p_completed, false)
    or (v_watched_percent is not null and v_watched_percent >= 95);

  insert into public.video_views (
    user_id,
    post_id,
    watched_ms,
    duration_ms,
    watched_percent,
    completed
  )
  values (
    v_uid,
    p_post_id,
    v_watched_ms,
    coalesce(p_duration_ms, 0),
    v_watched_percent,
    v_completed
  );

  update public.user_post_view_state ups
  set
    total_watched_ms = coalesce(ups.total_watched_ms, 0) + v_watched_ms,
    last_viewed_at   = now()
  where ups.user_id = v_uid
    and ups.post_id = p_post_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    insert into public.user_post_view_state (
      user_id,
      post_id,
      total_watched_ms,
      last_viewed_at
    )
    values (v_uid, p_post_id, v_watched_ms, now());
  end if;

  -- Creator affinity op basis van kijkgedrag (nieuw)
  select user_id
  into v_creator_id
  from public.posts
  where id = p_post_id;

  if v_creator_id is not null then
    v_score_delta := 0.5;

    if coalesce(v_watched_percent, 0) >= 50 then
      v_score_delta := v_score_delta + 1.0;
    end if;

    if v_completed then
      v_score_delta := v_score_delta + 2.0;
    end if;

    perform public.apply_creator_affinity(
      v_uid,
      v_creator_id,
      v_score_delta,
      1,
      case when v_completed then 1 else 0 end,
      0,
      0
    );
  end if;
end;
$$;

grant execute on function public.record_video_view(
  uuid, integer, integer, numeric, boolean
) to authenticated;

grant execute on function public.record_video_view(
  uuid, integer, integer, numeric, boolean
) to service_role;


-- =============================================================================
-- SECTIE 8: get_personalized_feed (bijgewerkt met creator affinity)
--
-- Nieuwe scorefactoren bovenop het bestaande algoritme:
--
--   Creator affinity boost:
--     least(max 50, ucp.score) * 0.12   → max +6.0
--
--   Follow + recency boost (ALLEEN voor posts MET hashtags):
--     Nieuw < 24h + gevolgd creator:     +6.0
--     Nieuw < 72h + gevolgd creator:     +3.0
--     ucp.score >= 15 + post < 48h:      +4.0 (hoge affinity, ook zonder follow)
--
--   No-tag beveiliging blijft intact:
--     No-tag posts → base_score * 0.1 - 10
--     Follow recency boost geldt NIET voor no-tag posts (CASE guard)
--     Creator affinity in base_score wordt ook 10× gereduceerd door demping
--
-- Scoreanalyse no-tag + gevolgde creator (worst case):
--   base_score ≈ 0 + 0 + 4.9 + 0.75 + 0 + 1.8 (affinity) = 7.45
--   ranking_score = 7.45 * 0.1 - 10 = -9.255
--
-- Tagged post van onbekende creator (best case ter vergelijking):
--   base_score ≈ 4.9 + 0.75 = 5.65
--   ranking_score = 5.65 + 1.0 = +6.65
--
-- Conclusie: no-tag + gevolgd creator (-9.3) < tagged + onbekend (+6.7) ✓
-- =============================================================================

drop function if exists public.get_personalized_feed(integer, uuid[]);

create function public.get_personalized_feed(
  p_limit             integer   default 10,
  p_exclude_post_ids  uuid[]    default '{}'::uuid[]
)
returns table(
  id              uuid,
  user_id         text,
  type            text,
  video_url       text,
  r2_key          text,
  thumbnail_url   text,
  caption         text,
  likes_count     integer,
  comments_count  integer,
  created_at      timestamp with time zone,
  tags            text[],
  ranking_score   numeric
)
language sql
stable
security definer
set search_path = public
as $function$
  with current_user_id as (
    select auth.uid() as user_id
  ),

  -- Completion stats per post (eenmalig buiten de loop)
  video_completion_stats as (
    select
      vv.post_id,
      count(*)::integer                                                      as view_count,
      avg(vv.watched_percent)                                                as avg_watched_percent,
      count(*) filter (where coalesce(vv.completed, false))::numeric
        / nullif(count(*), 0)::numeric                                       as completion_rate
    from public.video_views vv
    group by vv.post_id
  ),

  -- Fase 1: basisscores + explore filter
  base_scored as (
    select
      p.id,
      p.user_id,
      p.type,
      p.video_url,
      p.r2_key,
      p.thumbnail_url,
      p.caption,
      p.likes_count,
      p.comments_count,
      p.created_at,
      coalesce(p.tags, '{}')                          as tags,
      cardinality(coalesce(p.tags, '{}'::text[]))     as tag_count,

      (
        -- Tag-preference score (gepersonaliseerd op basis van interactiehistorie)
        coalesce(sum(utp.score), 0)

        -- Engagement
        + least(coalesce(p.likes_count, 0), 50) * 0.15
        + least(coalesce(p.comments_count, 0), 30) * 0.2

        -- Recency (max +5, daalt naar 0 na 5 dagen)
        + greatest(
            0,
            5 - extract(epoch from (now() - p.created_at)) / 86400
          )

        -- Random jitter (lichte variatie per request; zorgt ook voor basisdiversiteit)
        + random() * 1.5

        -- Completion boost (min. 3 views vereist om ruis te voorkomen)
        + case
            when coalesce(vc.view_count, 0) >= 3 then
              coalesce(vc.completion_rate, 0) * 4.0
              + least(coalesce(vc.avg_watched_percent, 0), 100) * 0.02
            else 0
          end

        -- Creator affinity boost (max +6 bij score = 50, geclampt)
        -- Voor no-tag posts: dit bedrag wordt 10× gereduceerd door de demping in fase 2
        + least(greatest(coalesce(ucp.score, 0), 0), 50) * 0.12

        -- Follow + recency boost (alleen voor posts MÉT hashtags)
        -- Garandeert dat no-tag posts nooit extra boost krijgen via follows
        + case
            when cardinality(coalesce(p.tags, '{}'::text[])) > 0 then
              case
                when f.follower_id is not null
                 and p.created_at > now() - interval '24 hours'  then 6.0
                when f.follower_id is not null
                 and p.created_at > now() - interval '72 hours'  then 3.0
                when coalesce(ucp.score, 0) >= 15
                 and p.created_at > now() - interval '48 hours'  then 4.0
                else 0
              end
            else 0
          end
      )                                               as base_score

    from public.posts p
    cross join current_user_id cu

    -- Completion stats
    left join video_completion_stats vc
      on vc.post_id = p.id

    -- Tag-preference (personalisatie op hashtags)
    left join public.user_tag_preferences utp
      on utp.user_id = cu.user_id
     and utp.tag = any(coalesce(p.tags, '{}'))

    -- View-state (7-dagenregel)
    left join public.user_post_view_state upvs
      on upvs.user_id = cu.user_id
     and upvs.post_id = p.id

    -- Creator affinity
    left join public.user_creator_preferences ucp
      on ucp.user_id = cu.user_id
     and ucp.creator_id = p.user_id

    -- Follow-status (voor recency boost)
    left join public.follows f
      on f.follower_id = cu.user_id
     and f.following_id::text = p.user_id

    where
      coalesce(p.is_deleted, false) = false
      and coalesce(p.type, 'video') = 'video'
      and not (p.id = any(coalesce(p_exclude_post_ids, '{}'::uuid[])))

      -- 7-dagenregel: al geziene posts komen pas terug na 7 dagen
      and (
        upvs.post_id is null
        or upvs.last_viewed_at < now() - interval '7 days'
      )

      -- Explore filter: 95% van no-tag posts wordt hier hard uitgesloten.
      -- Alleen 5% haalt fase 2 (met sterk gedempte score).
      and (
        cardinality(coalesce(p.tags, '{}'::text[])) > 0
        or random() < 0.05
      )

    group by
      p.id,
      p.user_id,
      p.type,
      p.video_url,
      p.r2_key,
      p.thumbnail_url,
      p.caption,
      p.likes_count,
      p.comments_count,
      p.created_at,
      p.tags,
      vc.view_count,
      vc.avg_watched_percent,
      vc.completion_rate,
      ucp.score,        -- creator affinity score (null = onbekende creator)
      f.follower_id     -- null = niet gevolgd, non-null = gevolgd
  ),

  -- Fase 2: harde demping voor no-tag posts; bonus voor tagged posts
  ranked_posts as (
    select
      id,
      user_id,
      type,
      video_url,
      r2_key,
      thumbnail_url,
      caption,
      likes_count,
      comments_count,
      created_at,
      tags,
      -- Geen hashtags: base_score * 0.1 - 10  (bijv. base=7.5 → -9.25)
      -- Wel hashtags:  base_score + 1.0        (bijv. base=7.5 → +8.5)
      case
        when tag_count = 0 then (base_score * 0.1 - 10)::numeric
        else (base_score + 1.0)::numeric
      end as ranking_score
    from base_scored
  )

  select *
  from ranked_posts
  order by
    case
      when cardinality(coalesce(tags, '{}'::text[])) > 0 then 0
      else 1
    end asc,
    ranking_score desc,
    created_at desc
  limit least(greatest(coalesce(p_limit, 10), 1), 25);
$function$;


-- =============================================================================
-- SECTIE 9: GRANTS + NOTIFY
-- =============================================================================

grant execute on function public.get_personalized_feed(integer, uuid[]) to authenticated;

notify pgrst, 'reload schema';
