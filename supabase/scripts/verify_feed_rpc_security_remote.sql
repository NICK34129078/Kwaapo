-- Remote integration checks for migration 0042 (JWT simulation as account A/B)
create temp table _sec_results (test_name text, outcome text);

-- A: cross-user insert must fail (RLS)
do $$
declare v_outcome text;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"294fed69-355a-48d3-a1bb-80977dbbf356","role":"authenticated"}',
    true
  );
  begin
    set local role authenticated;
    insert into public.user_tag_preferences (user_id, tag, score)
    values ('3fc12b2a-34ff-415a-801e-f374290a8c21'::uuid, 'rls_hack_test', 999);
    reset role;
    v_outcome := 'FAIL: insert succeeded';
  exception when others then
    reset role;
    v_outcome := 'PASS: ' || sqlerrm;
  end;
  insert into _sec_results values ('A insert B prefs (RLS)', v_outcome);
end $$;

-- A: self insert must fail (RLS)
do $$
declare v_outcome text;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"294fed69-355a-48d3-a1bb-80977dbbf356","role":"authenticated"}',
    true
  );
  begin
    set local role authenticated;
    insert into public.user_tag_preferences (user_id, tag, score)
    values ('294fed69-355a-48d3-a1bb-80977dbbf356'::uuid, 'rls_self_hack', 999);
    reset role;
    v_outcome := 'FAIL: insert succeeded';
  exception when others then
    reset role;
    v_outcome := 'PASS: ' || sqlerrm;
  end;
  insert into _sec_results values ('A self insert prefs (RLS)', v_outcome);
end $$;

-- A: read own prefs
do $$
declare v_count integer;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"294fed69-355a-48d3-a1bb-80977dbbf356","role":"authenticated"}',
    true
  );
  set local role authenticated;
  select count(*) into v_count
  from public.user_tag_preferences
  where user_id = '294fed69-355a-48d3-a1bb-80977dbbf356'::uuid;
  reset role;
  insert into _sec_results values ('A read own prefs', 'PASS: ' || v_count || ' rows');
end $$;

-- A: record_content_interactions
do $$
declare v_result jsonb;
declare v_outcome text;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"294fed69-355a-48d3-a1bb-80977dbbf356","role":"authenticated"}',
    true
  );
  begin
    set local role authenticated;
    v_result := public.record_content_interactions(
      jsonb_build_array(
        jsonb_build_object(
          'post_id', (select id::text from public.posts where coalesce(is_deleted, false) = false limit 1),
          'event_type', 'photo_dwell',
          'watch_duration_ms', 3000
        )
      )
    );
    reset role;
    v_outcome := 'PASS: ' || v_result::text;
  exception when others then
    reset role;
    v_outcome := 'FAIL: ' || sqlerrm;
  end;
  insert into _sec_results values ('A record_content_interactions', v_outcome);
end $$;

-- A: record_video_view
do $$
declare v_outcome text;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"294fed69-355a-48d3-a1bb-80977dbbf356","role":"authenticated"}',
    true
  );
  begin
    set local role authenticated;
    perform public.record_video_view(
      (select id from public.posts where coalesce(is_deleted, false) = false and type = 'video' limit 1),
      5000,
      10000,
      50,
      false
    );
    reset role;
    v_outcome := 'PASS: executed';
  exception when others then
    reset role;
    v_outcome := 'FAIL: ' || sqlerrm;
  end;
  insert into _sec_results values ('A record_video_view', v_outcome);
end $$;

-- A: personalized feed (as A via JWT)
do $$
declare v_count integer;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"294fed69-355a-48d3-a1bb-80977dbbf356","role":"authenticated"}',
    true
  );
  set local role authenticated;
  select count(*) into v_count from public.get_personalized_feed(5, '{}'::uuid[]);
  reset role;
  insert into _sec_results values ('A get_personalized_feed', 'PASS: ' || v_count || ' rows');
end $$;

-- B: personalized feed (as B via JWT)
do $$
declare v_count integer;
begin
  perform set_config(
    'request.jwt.claims',
    '{"sub":"3fc12b2a-34ff-415a-801e-f374290a8c21","role":"authenticated"}',
    true
  );
  set local role authenticated;
  select count(*) into v_count from public.get_personalized_feed(5, '{}'::uuid[]);
  reset role;
  insert into _sec_results values ('B get_personalized_feed', 'PASS: ' || v_count || ' rows');
end $$;

-- Explore feed (anon-compatible RPC)
insert into _sec_results
select 'get_explore_feed (postgres)', 'PASS: ' || count(*)::text || ' rows'
from public.get_explore_feed(5, '{}'::uuid[]);

-- B prefs integrity after A hack attempt
insert into _sec_results
select 'B prefs not poisoned',
  case when count(*) = 0 then 'PASS: no rls_hack_test row' else 'FAIL: found rls_hack_test' end
from public.user_tag_preferences
where user_id = '3fc12b2a-34ff-415a-801e-f374290a8c21'::uuid
  and tag = 'rls_hack_test';

select * from _sec_results order by test_name;
