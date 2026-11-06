-- 사용자 제공 ERD에 맞춘 후속 스키마. 001을 먼저 적용한 빈 개발 DB에서 검증합니다.
-- 탈퇴·익명화 정책 확정 전에는 경기 기록의 계정 참조를 RESTRICT로 보호합니다.
begin;

-- 기존 기록의 캐릭터를 추측하거나 NULL 계정 기록을 삭제하지 않습니다.
do $$
begin
  if exists (select 1 from public.match_participants) then
    raise exception 'ERD 업그레이드 전에 기존 참가 기록의 character_key 백필 계획이 필요합니다.';
  end if;
  if exists (select 1 from public.matches) then
    raise exception 'ERD 업그레이드 전에 기존 경기 기록의 참가자·상태 이관 계획이 필요합니다.';
  end if;
end;
$$;

alter table public.matches rename column player_a to player1_id;
alter table public.matches rename column player_b to player2_id;
alter index public.matches_player_a rename to matches_player1;
alter index public.matches_player_b rename to matches_player2;

alter table public.matches
  drop constraint matches_player_a_fkey,
  drop constraint matches_player_b_fkey,
  drop constraint matches_winner_id_fkey,
  alter column player1_id set not null,
  alter column player2_id set not null,
  add constraint matches_player1_id_fkey foreign key (player1_id)
    references auth.users(id) on delete restrict,
  add constraint matches_player2_id_fkey foreign key (player2_id)
    references auth.users(id) on delete restrict,
  add constraint matches_winner_id_fkey foreign key (winner_id)
    references auth.users(id) on delete restrict,
  add constraint matches_metadata_check check (
    char_length(btrim(rules_version)) between 1 and 80
    and char_length(btrim(server_instance_id)) between 1 and 128
  ),
  add constraint matches_time_order_check check (
    (started_at is null or started_at >= created_at)
    and (ended_at is null or ended_at >= coalesce(started_at, created_at))
  ),
  add constraint matches_lifecycle_check check (
    (status = 'preparing' and started_at is null and ended_at is null
      and winner_id is null and reason is null)
    or (status in ('active', 'finalizing') and started_at is not null and ended_at is null
      and winner_id is null and reason is null)
    or (status = 'completed' and started_at is not null and ended_at is not null
      and reason is not null and reason <> 'server_failure'
      and (reason <> 'draw' or winner_id is null)
      and (reason not in ('surrender', 'disconnect') or winner_id is not null))
    or (status = 'cancelled' and started_at is null and ended_at is not null
      and winner_id is null and reason is null)
    or (status = 'void' and ended_at is not null and winner_id is null
      and reason in ('server_failure', 'disconnect'))
  );

alter table public.player_stats
  drop constraint player_stats_user_id_fkey,
  add constraint player_stats_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade;

alter table public.match_participants
  drop constraint match_participants_user_id_fkey,
  drop constraint match_participants_outcome_check,
  add constraint match_participants_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete restrict,
  add column character_key text not null
    check (character_key in ('brawler', 'sword', 'archer', 'mage')),
  alter column streak_before drop default,
  alter column streak_before drop not null,
  add constraint match_participants_outcome_check check (outcome in ('win', 'loss', 'draw'));

alter table public.active_participations
  drop constraint active_participations_user_id_fkey,
  add constraint active_participations_user_id_fkey foreign key (user_id)
    references auth.users(id) on delete cascade,
  add constraint active_participations_reference_check
    check (char_length(btrim(queue_or_match_id)) between 1 and 128);

create table public.match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid references auth.users(id) on delete restrict,
  event_type text not null check (event_type ~ '^[a-z][a-z0-9_]{0,47}$'),
  payload jsonb check (payload is null or jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now()
);

create index match_participants_user_history on public.match_participants (user_id, match_id);
create index active_participations_expiry on public.active_participations (lease_expires_at);
create index match_events_match_time on public.match_events (match_id, occurred_at, id);
create index match_events_user_time on public.match_events (user_id, occurred_at desc)
  where user_id is not null;
create index match_events_retention on public.match_events (occurred_at);

-- 일반 CHECK로 별도 행·테이블의 관계를 보장할 수 없어 트랜잭션 끝에서 검사합니다.
-- 경기 행과 참가자 2행은 한 트랜잭션 안에서 생성·갱신해야 합니다.
create function public.assert_match_participants(p_match_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches%rowtype;
  participant_count integer;
  valid_user_count integer;
begin
  select * into m from public.matches where id = p_match_id for update;
  if not found then return; end if; -- 경기 삭제에 따른 참가자 CASCADE는 허용합니다.

  select count(*), count(*) filter (where user_id in (m.player1_id, m.player2_id))
    into participant_count, valid_user_count
    from public.match_participants where match_id = p_match_id;
  if participant_count <> 2 or valid_user_count <> 2 then
    raise exception '경기는 지정한 두 계정의 참가자 행을 정확히 2개 가져야 합니다.'
      using errcode = '23514', constraint = 'match_participants_exact_pair';
  end if;

  if m.status = 'completed' then
    if exists (
      select 1 from public.match_participants p where p.match_id = m.id and (
        p.outcome is distinct from case
          when m.winner_id is null then 'draw'
          when p.user_id = m.winner_id then 'win' else 'loss' end
        or p.streak_before is null or p.streak_after is null or p.final_hp is null
        or p.streak_after is distinct from case
          when p.user_id = m.winner_id then p.streak_before + 1 else 0 end
      )
    ) then
      raise exception '확정 경기의 승패·연승·최종 체력이 일치하지 않습니다.'
        using errcode = '23514', constraint = 'match_participants_result_consistency';
    end if;
  elsif exists (
    select 1 from public.match_participants p
    where p.match_id = m.id and (p.outcome is not null or p.streak_after is not null)
  ) then
    raise exception '미확정·취소·무효 경기에는 확정 승패·연승을 기록할 수 없습니다.'
      using errcode = '23514', constraint = 'match_participants_unsettled_result';
  end if;
end;
$$;

create function public.enforce_match_participants() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_table_name = 'matches' then
    perform public.assert_match_participants(new.id);
  elsif tg_op = 'DELETE' then
    perform public.assert_match_participants(old.match_id);
  else
    if tg_op = 'UPDATE' and old.match_id is distinct from new.match_id then
      perform public.assert_match_participants(old.match_id);
    end if;
    perform public.assert_match_participants(new.match_id);
  end if;
  return null;
end;
$$;

create constraint trigger matches_participants_integrity
  after insert or update on public.matches
  deferrable initially deferred for each row
  execute function public.enforce_match_participants();
create constraint trigger participants_match_integrity
  after insert or update or delete on public.match_participants
  deferrable initially deferred for each row
  execute function public.enforce_match_participants();

revoke all on function public.assert_match_participants(uuid)
  from public, anon, authenticated;
revoke all on function public.enforce_match_participants()
  from public, anon, authenticated;

alter table public.match_events enable row level security;
revoke all on public.match_events from anon, authenticated;
revoke all on sequence public.match_events_id_seq from anon, authenticated;
grant all on public.profiles, public.player_stats, public.matches,
  public.match_participants, public.active_participations, public.match_events to service_role;
grant usage, select on sequence public.match_events_id_seq to service_role;

comment on table public.match_events is
  '서버 전용 이벤트. 토큰·이메일·원문 입력·매 프레임 전투 상태를 기록하지 않습니다.';
comment on column public.active_participations.queue_or_match_id is
  'ERD 원안의 다형 참조. queued는 대기표, 나머지는 경기 UUID 문자열이며 FK는 없습니다.';
comment on column public.match_participants.character_key is
  '게임 코드의 고정 캐릭터 키. 전투 시작 전 확정하며 실제 선택 연결은 후속 작업입니다.';

commit;
