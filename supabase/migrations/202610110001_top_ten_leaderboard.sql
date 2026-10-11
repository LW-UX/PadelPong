begin;

create or replace function public.get_pong_leaderboard(
  p_round_id uuid default null,
  p_difficulty text default 'hard',
  p_ruleset text default 'classic'
)
returns jsonb language plpgsql stable security definer set search_path = '' as $$
begin
  if p_ruleset is null or p_ruleset not in ('classic', 'v2') then
    raise exception 'Ungültige Spielversion.' using errcode = '22023';
  end if;
  if p_difficulty is null or p_difficulty not in ('easy', 'hard') then
    raise exception 'Ungültige Schwierigkeitsstufe.' using errcode = '22023';
  end if;
  return (with ranked as materialized (
    select display_name, computer_score, duration_ms, created_at, round_id, best_rally,
      rank() over (order by computer_score, duration_ms) as place
    from public.pong_wins where ruleset = p_ruleset and difficulty = p_difficulty
  ), visible as (
    select * from ranked order by computer_score, duration_ms, created_at, round_id limit 10
  )
  select jsonb_build_object(
    'ruleset', p_ruleset, 'difficulty', p_difficulty,
    'entries', coalesce((select jsonb_agg(jsonb_build_object('rank', place, 'name', display_name,
      'computerScore', computer_score, 'durationMs', duration_ms, 'createdAt', created_at, 'bestRally', best_rally, 'isOwn', coalesce(round_id = p_round_id, false))
      order by computer_score, duration_ms, created_at, round_id) from visible), '[]'::jsonb),
    'ownEntry', (select jsonb_build_object('rank', place, 'name', display_name,
      'computerScore', computer_score, 'durationMs', duration_ms, 'createdAt', created_at, 'bestRally', best_rally, 'isOwn', true)
      from ranked where round_id = p_round_id
        and not exists (select 1 from visible where round_id = p_round_id))
  ));
end;
$$;

commit;
