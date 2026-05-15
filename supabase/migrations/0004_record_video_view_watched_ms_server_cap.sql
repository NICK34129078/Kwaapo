-- 0004: Server-side cap op p_watched_ms in public.record_video_view
--
-- Deze migratie wijzigt GEEN functie automatisch (om bestaande score-/duplicate-logica
-- in Supabase niet per ongeluk te overschrijven).
--
-- Stappen:
-- 1) Supabase SQL Editor:
--      select pg_get_functiondef('public.record_video_view'::regproc);
-- 2) Voeg in DECLARE toe: v_watched_ms integer;
-- 3) Direct na BEGIN (voor elke andere logica):
--      if coalesce(p_duration_ms, 0) > 0 then
--        v_watched_ms := least(greatest(coalesce(p_watched_ms, 0), 0), p_duration_ms);
--      else
--        v_watched_ms := least(greatest(coalesce(p_watched_ms, 0), 0), 120000);
--      end if;
-- 4) Vervang overal waar je nu p_watched_ms gebruikt voor opslag/aggregatie door v_watched_ms:
--      - minimum check (< 500)
--      - watched_percent als duration bekend is
--      - insert in video_views (kolom watched_ms)
--      - total_watched_ms in user_post_view_state
--      - return (json) met watched_ms: v_watched_ms indien van toepassing
-- 5) notify pgrst, 'reload schema'; en grants behouden zoals in je huidige definitie.
--
-- Volledige plak-SQL (CREATE OR REPLACE + grants + notify) staat in het Cursor-chatantwoord
-- bij dezelfde taak; pas kolommen aan aan jouw echte tabellen.

do $$ begin
  -- placeholder zodat migratie geldig SQL blijft
  null;
end $$;
