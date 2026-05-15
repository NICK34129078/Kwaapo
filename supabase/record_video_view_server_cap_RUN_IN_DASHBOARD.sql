-- =============================================================================
-- RUN IN SUPABASE SQL EDITOR (niet via supabase db push tenzij je schema exact matcht)
--
-- 1) Exporteer eerst je huidige functie:
--      select pg_get_functiondef('public.record_video_view'::regproc);
-- 2) Als je score-/duplicate-logica hebt: kopieer die terug tussen de PRESERVE-secties,
--    of vervang deze hele CREATE OR REPLACE door jouw definitie + merge van v_watched_ms
--    (zie ook supabase/migrations/0004_record_video_view_watched_ms_server_cap.sql).
--
-- Kolommen hieronder moeten overeenkomen met jouw public.video_views en
-- public.user_post_view_state (pas aan indien nodig).
-- =============================================================================

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

  -- ### PRESERVE: DUPLICATE CHECK — plak hier je bestaande IF/RETURN/EXISTS-logica ###

  -- ### PRESERVE: SCORE / TAG / OVERIG — plak hier je bestaande updates ###

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
    total_watched_ms = coalesce(ups.total_watched_ms, 0) + v_watched_ms
  where ups.user_id = v_uid
    and ups.post_id = p_post_id;

  get diagnostics v_updated = row_count;
  if v_updated = 0 then
    insert into public.user_post_view_state (user_id, post_id, total_watched_ms)
    values (v_uid, p_post_id, v_watched_ms);
  end if;

  -- ### PRESERVE: return / jsonb — voeg hier je oorspronkelijke return toe indien van toepassing ###
end;
$$;

grant execute on function public.record_video_view(
  uuid,
  integer,
  integer,
  numeric,
  boolean
) to authenticated;

grant execute on function public.record_video_view(
  uuid,
  integer,
  integer,
  numeric,
  boolean
) to service_role;

notify pgrst, 'reload schema';
