begin;

-- Anonymous player feedback. The browser writes only through the RPC below;
-- the table itself is not readable or writable by public roles.
create table public.pong_feedback (
  feedback_id uuid primary key,
  message text not null check (char_length(message) between 3 and 1000),
  mode text not null check (mode in ('computer', 'local', 'online')),
  gameplay text not null check (gameplay in ('standard', 'lob-smash-v1')),
  difficulty text not null check (difficulty in ('easy', 'hard')),
  device text not null check (device in ('desktop', 'mobile')),
  created_at timestamptz not null default now()
);
alter table public.pong_feedback enable row level security;
revoke all on public.pong_feedback from public, anon, authenticated;

create or replace function public.submit_pong_feedback(
  p_feedback_id uuid,
  p_message text,
  p_mode text,
  p_gameplay text,
  p_difficulty text,
  p_device text
)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_message text := btrim(coalesce(p_message, ''));
begin
  if p_feedback_id is null then
    raise exception 'PONG_FEEDBACK_INVALID' using errcode = '22023';
  end if;
  if char_length(v_message) < 3 or char_length(v_message) > 1000 then
    raise exception 'PONG_FEEDBACK_LENGTH' using errcode = '22023';
  end if;
  if v_message ~ '[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]' then
    raise exception 'PONG_FEEDBACK_INVALID' using errcode = '22023';
  end if;
  if p_mode is null or p_mode not in ('computer', 'local', 'online')
    or p_gameplay is null or p_gameplay not in ('standard', 'lob-smash-v1')
    or p_difficulty is null or p_difficulty not in ('easy', 'hard')
    or p_device is null or p_device not in ('desktop', 'mobile') then
    raise exception 'PONG_FEEDBACK_INVALID' using errcode = '22023';
  end if;
  -- Coarse global brake against scripted flooding; regular players never reach it.
  if (select count(*) from public.pong_feedback where created_at > now() - interval '1 minute') >= 30 then
    raise exception 'PONG_FEEDBACK_BUSY' using errcode = '54000';
  end if;
  insert into public.pong_feedback (feedback_id, message, mode, gameplay, difficulty, device)
  values (p_feedback_id, v_message, p_mode, p_gameplay, p_difficulty, p_device)
  on conflict (feedback_id) do nothing;
  return jsonb_build_object('saved', true);
end;
$$;

revoke all on function public.submit_pong_feedback(uuid, text, text, text, text, text) from public;
grant execute on function public.submit_pong_feedback(uuid, text, text, text, text, text) to anon, authenticated;

commit;
