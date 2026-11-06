-- 재검수 수정안. 기존 001/002와 외부 DB를 수정하지 않고 검토·승인 후 적용합니다.
begin;

-- CHECK는 NULL도 통과하므로 무효 사유의 누락을 별도로 거절합니다.
alter table public.matches add constraint matches_void_reason_required
  check (status <> 'void' or reason is not null);

-- TRUNCATE는 행 단위 지연 제약을 실행하지 않으므로 서버 역할에 주지 않습니다.
revoke all on public.profiles, public.player_stats, public.matches,
  public.match_participants, public.active_participations, public.match_events
  from public, service_role;
grant select, insert, update, delete on public.profiles, public.player_stats, public.matches,
  public.match_participants, public.active_participations, public.match_events to service_role;
revoke all on sequence public.match_events_id_seq from public, anon, authenticated, service_role;
grant usage, select on sequence public.match_events_id_seq to service_role;

-- 현재 ERD의 HP 0~100·동일 최대 HP 규칙을 기준으로 결과의 모순을 막습니다.
create function public.assert_match_result_health(p_match_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  m public.matches%rowtype;
  hp1 integer;
  hp2 integer;
  winner_hp integer;
  loser_hp integer;
begin
  select * into m from public.matches where id = p_match_id for update;
  if not found or m.status <> 'completed' then return; end if;
  select max(final_hp) filter (where user_id = m.player1_id),
    max(final_hp) filter (where user_id = m.player2_id)
    into hp1, hp2 from public.match_participants where match_id = p_match_id;
  if hp1 is null or hp2 is null then
    raise exception '확정 결과의 최종 체력이 필요합니다.'
      using errcode = '23514', constraint = 'match_result_health_consistency';
  end if;
  winner_hp := case when m.winner_id = m.player1_id then hp1 else hp2 end;
  loser_hp := case when m.winner_id = m.player1_id then hp2 else hp1 end;
  if (m.reason = 'ko' and (
        (m.winner_id is null and (hp1 <> 0 or hp2 <> 0))
        or (m.winner_id is not null and (winner_hp <= 0 or loser_hp <> 0))))
    or (m.reason = 'timeout' and (
        (m.winner_id is null and hp1 <> hp2)
        or (m.winner_id is not null and winner_hp <= loser_hp)))
    or (m.reason = 'draw' and hp1 <> hp2) then
    raise exception '종료 원인·승자·양쪽 최종 체력이 일치하지 않습니다.'
      using errcode = '23514', constraint = 'match_result_health_consistency';
  end if;
end;
$$;

create or replace function public.enforce_match_participants() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  match_ids uuid[];
  match_id uuid;
begin
  if tg_table_name = 'matches' then
    match_ids := array[new.id];
  elsif tg_op = 'DELETE' then
    match_ids := array[old.match_id];
  elsif tg_op = 'UPDATE' and old.match_id is distinct from new.match_id then
    match_ids := array[old.match_id, new.match_id];
  else
    match_ids := array[new.match_id];
  end if;
  foreach match_id in array match_ids loop
    perform public.assert_match_participants(match_id);
    perform public.assert_match_result_health(match_id);
  end loop;
  return null;
end;
$$;

revoke all on function public.assert_match_result_health(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.assert_match_participants(uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.enforce_match_participants()
  from public, anon, authenticated, service_role;

-- 002 적용 뒤 들어온 기존 기록도 검사합니다. 추측으로 고치지 않고 전체를 롤백합니다.
do $$
declare
  match_id uuid;
begin
  for match_id in select id from public.matches order by id loop
    perform public.assert_match_participants(match_id);
    perform public.assert_match_result_health(match_id);
  end loop;
end;
$$;

commit;
