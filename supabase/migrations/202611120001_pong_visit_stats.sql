begin;

-- Anonymous visit statistics: one row per page load, without cookies,
-- stored browser identifiers, names or full referrer URLs (only the
-- referring host, plus its first path segment on the own GitHub Pages host). The browser
-- writes only through the RPC below; the table is not publicly readable.
create table public.pong_visits (
  visit_id uuid primary key,
  device text not null check (device in ('desktop', 'mobile')),
  referrer text check (referrer ~ '^[a-z0-9.-]{1,100}(/[a-z0-9._-]{1,60})?$'),
  visible_seconds integer not null default 0 check (visible_seconds between 0 and 86400),
  play_seconds integer not null default 0 check (play_seconds between 0 and 86400),
  matches_started integer not null default 0 check (matches_started between 0 and 1000),
  matches_finished integer not null default 0 check (matches_finished between 0 and 1000),
  computer_matches integer not null default 0 check (computer_matches between 0 and 1000),
  local_matches integer not null default 0 check (local_matches between 0 and 1000),
  online_matches integer not null default 0 check (online_matches between 0 and 1000),
  doubles_matches integer not null default 0 check (doubles_matches between 0 and 1000),
  lob_smash_matches integer not null default 0 check (lob_smash_matches between 0 and 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index pong_visits_created_at_idx on public.pong_visits (created_at);
alter table public.pong_visits enable row level security;
revoke all on public.pong_visits from public, anon, authenticated;

-- The browser sends cumulative totals for its visit several times (each time
-- the tab is hidden and after each finished match). Values only ever grow, so
-- late or repeated deliveries cannot shrink a visit.
create or replace function public.record_pong_visit(
  p_visit_id uuid,
  p_device text,
  p_referrer text,
  p_visible_seconds integer,
  p_play_seconds integer,
  p_matches_started integer,
  p_matches_finished integer,
  p_computer_matches integer,
  p_local_matches integer,
  p_online_matches integer,
  p_doubles_matches integer,
  p_lob_smash_matches integer
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_referrer text := nullif(lower(btrim(coalesce(p_referrer, ''))), '');
begin
  if p_visit_id is null or p_device is null or p_device not in ('desktop', 'mobile')
    or (v_referrer is not null and v_referrer !~ '^[a-z0-9.-]{1,100}(/[a-z0-9._-]{1,60})?$')
    or p_visible_seconds is null or p_visible_seconds not between 0 and 86400
    or p_play_seconds is null or p_play_seconds not between 0 and 86400
    or p_matches_started is null or p_matches_started not between 0 and 1000
    or p_matches_finished is null or p_matches_finished not between 0 and 1000
    or p_computer_matches is null or p_computer_matches not between 0 and 1000
    or p_local_matches is null or p_local_matches not between 0 and 1000
    or p_online_matches is null or p_online_matches not between 0 and 1000
    or p_doubles_matches is null or p_doubles_matches not between 0 and 1000
    or p_lob_smash_matches is null or p_lob_smash_matches not between 0 and 1000 then
    raise exception 'PONG_VISIT_INVALID' using errcode = '22023';
  end if;

  if exists (select 1 from public.pong_visits where visit_id = p_visit_id) then
    -- A visit can only be extended for one day after it began.
    update public.pong_visits set
      visible_seconds = greatest(visible_seconds, p_visible_seconds),
      play_seconds = greatest(play_seconds, p_play_seconds),
      matches_started = greatest(matches_started, p_matches_started),
      matches_finished = greatest(matches_finished, p_matches_finished),
      computer_matches = greatest(computer_matches, p_computer_matches),
      local_matches = greatest(local_matches, p_local_matches),
      online_matches = greatest(online_matches, p_online_matches),
      doubles_matches = greatest(doubles_matches, p_doubles_matches),
      lob_smash_matches = greatest(lob_smash_matches, p_lob_smash_matches),
      updated_at = now()
    where visit_id = p_visit_id and created_at > now() - interval '1 day';
    return jsonb_build_object('saved', true);
  end if;

  -- Coarse global brake against scripted flooding; new visits beyond it are dropped silently.
  if (select count(*) from public.pong_visits where created_at > now() - interval '1 minute') >= 300 then
    return jsonb_build_object('saved', false);
  end if;
  insert into public.pong_visits (
    visit_id, device, referrer, visible_seconds, play_seconds, matches_started, matches_finished,
    computer_matches, local_matches, online_matches, doubles_matches, lob_smash_matches
  ) values (
    p_visit_id, p_device, v_referrer, p_visible_seconds, p_play_seconds, p_matches_started, p_matches_finished,
    p_computer_matches, p_local_matches, p_online_matches, p_doubles_matches, p_lob_smash_matches
  ) on conflict (visit_id) do nothing;
  return jsonb_build_object('saved', true);
end;
$$;

revoke all on function public.record_pong_visit(uuid, text, text, integer, integer, integer, integer, integer, integer, integer, integer, integer) from public;
grant execute on function public.record_pong_visit(uuid, text, text, integer, integer, integer, integer, integer, integer, integer, integer, integer) to anon, authenticated;

-- Daily overview for the project owner (service role only; not exposed to the browser).
create view public.pong_visit_daily with (security_invoker = true) as
select
  (created_at at time zone 'Europe/Berlin')::date as day,
  count(*) as visits,
  count(*) filter (where matches_started > 0) as playing_visits,
  count(*) filter (where device = 'mobile') as mobile_visits,
  round(avg(visible_seconds)) as avg_visible_seconds,
  percentile_cont(0.5) within group (order by visible_seconds) as median_visible_seconds,
  round(avg(play_seconds) filter (where matches_started > 0)) as avg_play_seconds_of_players,
  sum(matches_started) as matches_started,
  sum(matches_finished) as matches_finished,
  sum(computer_matches) as computer_matches,
  sum(local_matches) as local_matches,
  sum(online_matches) as online_matches,
  sum(doubles_matches) as doubles_matches,
  sum(lob_smash_matches) as lob_smash_matches
from public.pong_visits
group by 1;
revoke all on public.pong_visit_daily from public, anon, authenticated;

commit;
