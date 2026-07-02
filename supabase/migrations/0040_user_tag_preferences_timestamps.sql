-- Align legacy user_tag_preferences with apply_tag_preference helper.
alter table public.user_tag_preferences
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

-- Recreate helper without hard dependency on columns missing on legacy tables.
create or replace function public.apply_tag_preference(
  p_user_id uuid,
  p_tag text,
  p_score_delta numeric,
  p_positive_delta integer default 0,
  p_negative_delta integer default 0,
  p_views_delta integer default 0
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tag text := lower(trim(coalesce(p_tag, '')));
  v_clamp_min constant numeric := -100;
  v_clamp_max constant numeric := 200;
begin
  if p_user_id is null or v_tag = '' then
    return;
  end if;

  insert into public.user_tag_preferences (
    user_id, tag, score, positive_views_count, negative_views_count,
    views_count, last_interaction_at
  )
  values (
    p_user_id, v_tag,
    least(v_clamp_max, greatest(v_clamp_min, p_score_delta)),
    greatest(0, p_positive_delta),
    greatest(0, p_negative_delta),
    greatest(0, p_views_delta),
    now()
  )
  on conflict (user_id, tag) do update
    set
      score = least(
        v_clamp_max,
        greatest(v_clamp_min, user_tag_preferences.score + excluded.score)
      ),
      positive_views_count = user_tag_preferences.positive_views_count + excluded.positive_views_count,
      negative_views_count = user_tag_preferences.negative_views_count + excluded.negative_views_count,
      views_count = user_tag_preferences.views_count + excluded.views_count,
      last_interaction_at = now();
end;
$$;

notify pgrst, 'reload schema';
