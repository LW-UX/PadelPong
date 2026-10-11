-- Run through tools/supabase-mcp.mjs only after approval. No fixtures survive rollback.
begin;
do $$
declare
  v_id uuid := gen_random_uuid();
  v_second uuid := gen_random_uuid();
  v_result jsonb;
  v_rank bigint;
  v_bad_name text;
  v_own uuid := gen_random_uuid();
  v_top uuid;
  v_tied uuid := gen_random_uuid();
  i integer;
begin
  if has_table_privilege('anon', 'public.pong_wins', 'INSERT')
    or has_table_privilege('anon', 'public.pong_wins', 'SELECT')
    or has_table_privilege('authenticated', 'public.pong_wins', 'UPDATE')
    or has_table_privilege('authenticated', 'public.pong_wins', 'DELETE') then
    raise exception 'Direct table access must be blocked';
  end if;
  if not (select relrowsecurity from pg_class where oid = 'public.pong_wins'::regclass) then
    raise exception 'RLS must be enabled';
  end if;
  perform public.submit_pong_win(v_id, ' QASieg ', 7, 2, 60000, 12, p_ruleset => 'v2');
  perform public.submit_pong_win(v_id, 'QASieg', 7, 2, 60000, 12, p_ruleset => 'v2');
  if (select count(*) from public.pong_wins where round_id = v_id) <> 1 then
    raise exception 'Retry duplicated the result';
  end if;
  if (select display_name from public.pong_wins where round_id = v_id) <> 'QASieg' then
    raise exception 'Name was not trimmed';
  end if;
  if (select best_rally from public.pong_wins where round_id = v_id) is distinct from 12 then
    raise exception 'Longest rally was not stored';
  end if;
  begin
    perform public.submit_pong_win(v_id, 'QASieg', 7, 2, 60000, 99, p_ruleset => 'v2');
    raise exception 'Retry replaced longest rally';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.submit_pong_win(v_second, 'QARally', 7, 2, 60000, -1, p_ruleset => 'v2');
    raise exception 'Negative rally accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.submit_pong_win(v_second, 'QAVerlust', 4, 7, 60000, p_ruleset => 'v2');
    raise exception 'Loss was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.submit_pong_win(v_second, '', 7, 0, 60000, p_ruleset => 'v2');
    raise exception 'Empty name was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.submit_pong_win(v_second, 'QAZeit', 7, 0, 0, p_ruleset => 'v2');
    raise exception 'Invalid time was accepted';
  exception when invalid_parameter_value then null;
  end;
  begin
    perform public.submit_pong_win(v_id, 'QAManipulation', 7, 0, 100, p_ruleset => 'v2');
    raise exception 'Existing result was replaced';
  exception when invalid_parameter_value then null;
  end;
  foreach v_bad_name in array array['Name mit Leerzeichen', 'Ludi!', repeat('x', 17), 'HiTlEr', 'H1tler99', 'Hiiitler', 'Arschloch', 'Nazi123'] loop
    begin
      perform public.submit_pong_win(gen_random_uuid(), v_bad_name, 7, 2, 60000, p_ruleset => 'v2');
      raise exception 'Forbidden name was accepted: %', v_bad_name;
    exception when invalid_parameter_value then null;
    end;
  end loop;
  perform public.submit_pong_win(gen_random_uuid(), 'Jörg42', 7, 6, 60000, p_ruleset => 'v2');
  perform public.submit_pong_win(gen_random_uuid(), 'Nazim', 7, 6, 60000, p_ruleset => 'v2');
  v_result := public.submit_pong_win(v_second, 'QABesser', 7, 1, 90000, p_ruleset => 'v2');
  select 1 + count(*) into v_rank from public.pong_wins
    where ruleset = 'v2' and difficulty = 'hard' and (computer_score < 1 or (computer_score = 1 and duration_ms < 90000));
  if (v_result->>'rank')::bigint <> v_rank then raise exception 'Wrong rank'; end if;
  if (public.submit_pong_win(v_id, 'QASieg', 7, 2, 60000, 12, p_ruleset => 'v2')->>'rank')::bigint <= v_rank then
    raise exception 'Score must precede time';
  end if;
  for i in 1..11 loop
    perform public.submit_pong_win(gen_random_uuid(), 'QATop' || i, 7, 0, 1000 + i, p_ruleset => 'v2');
  end loop;
  perform public.submit_pong_win(v_own, 'QAEigen', 7, 6, 86400000, p_ruleset => 'v2');
  v_result := public.get_pong_leaderboard(v_own, p_ruleset => 'v2');
  if jsonb_array_length(v_result->'entries') <> 10 or v_result->'ownEntry'->>'name' <> 'QAEigen'
    or (v_result->'ownEntry'->>'rank')::bigint <= 10 then
    raise exception 'Own result outside top ten is missing';
  end if;
  select round_id into v_top from public.pong_wins where ruleset = 'v2' and difficulty = 'hard' order by computer_score, duration_ms, created_at, round_id limit 1;
  v_result := public.get_pong_leaderboard(v_top, p_ruleset => 'v2');
  if v_result->'ownEntry' <> 'null'::jsonb or not (v_result->'entries'->0->>'isOwn')::boolean then
    raise exception 'Top ten own result must be marked without duplicate';
  end if;
  v_result := public.get_pong_leaderboard(gen_random_uuid(), p_ruleset => 'v2');
  if v_result->'ownEntry' <> 'null'::jsonb then raise exception 'Unknown round has an own result'; end if;
  -- Even a tied rank of 1 belongs below the table when the exact round is outside its ten rows.
  for i in 1..10 loop
    perform public.submit_pong_win(gen_random_uuid(), 'QAGleich' || i, 7, 0, 1, p_ruleset => 'v2');
  end loop;
  perform public.submit_pong_win(v_tied, 'QAGleichEigen', 7, 0, 1, 999, p_ruleset => 'v2');
  update public.pong_wins set created_at = clock_timestamp() + interval '1 day' where round_id = v_tied;
  v_result := public.get_pong_leaderboard(v_tied, p_ruleset => 'v2');
  if v_result->'ownEntry'->>'name' is distinct from 'QAGleichEigen'
    or (v_result->'ownEntry'->>'rank')::bigint is distinct from 1::bigint then
    raise exception 'Tied own result outside ten rows is missing';
  end if;
  if (v_result->'ownEntry'->>'bestRally')::integer is distinct from 999
    or (v_result->'ownEntry'->>'createdAt')::timestamptz is distinct from
      (select created_at from public.pong_wins where round_id = v_tied) then
    raise exception 'Own entry details missing';
  end if;
  v_result := public.get_pong_leaderboard(p_ruleset => 'v2');
  if not ((v_result->'entries'->0) ? 'bestRally')
    or not ((v_result->'entries'->0) ? 'createdAt') then
    raise exception 'Top ten details missing';
  end if;
  if (select best_rally from public.pong_wins where round_id = v_second) is not null then
    raise exception 'Omitting the optional rally must retain unknown rally';
  end if;
  if jsonb_array_length(v_result->'entries') > 10 then raise exception 'Top ten exceeds limit'; end if;
  if (v_result->'entries'->0) ? 'round_id' then raise exception 'Round token is public'; end if;
end;
$$;
set local role anon;
select public.get_pong_leaderboard(p_ruleset => 'v2') is not null as anonymous_read_works;
select public.submit_pong_win(gen_random_uuid(), 'QAAnonym', 7, 6, 120000, p_ruleset => 'v2')->>'rank' as anonymous_write_rank;
reset role;
rollback;
