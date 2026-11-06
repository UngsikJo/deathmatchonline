\set ON_ERROR_STOP on
set timezone = 'UTC';
create schema test;
grant usage on schema test to authenticated, anon, service_role;
create function test.assert(p_condition boolean, p_message text) returns void
language plpgsql as $$
begin
  if p_condition is distinct from true then raise exception 'FAIL: %', p_message; end if;
end;
$$;
create function test.expect_error(p_sql text, p_state text, p_deferred boolean default false)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
    if p_deferred then set constraints all immediate; end if;
  exception when others then
    if sqlstate = p_state then return; end if;
    raise exception 'FAIL: 예상 SQLSTATE %, 실제 % (%)', p_state, sqlstate, sqlerrm;
  end;
  raise exception 'FAIL: 거절돼야 할 SQL이 성공했습니다: %', p_sql;
end;
$$;

insert into auth.users (id) values
  ('20000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000002'),
  ('20000000-0000-0000-0000-000000000003');
select test.assert((select count(*) = 6 from pg_tables where schemaname = 'public'), '서비스 테이블 6개');
select test.assert((select count(*) = 39 from information_schema.columns where table_schema = 'public'), '서비스 컬럼 39개');
select test.assert((select count(*) = 3 from public.profiles), '가입 시 프로필 생성');
select test.assert((select count(*) = 3 from public.player_stats), '가입 시 통계 생성');
select test.assert((select confrelid = 'auth.users'::regclass from pg_constraint
  where conname = 'player_stats_user_id_fkey'), '통계 FK가 auth.users PK 참조');
update public.profiles set nickname = 'Player_One' where user_id = '20000000-0000-0000-0000-000000000001';
select test.expect_error($sql$update public.profiles set nickname = 'pLaYeR_oNe'
  where user_id = '20000000-0000-0000-0000-000000000002'$sql$, '23505');
select test.expect_error($sql$update public.profiles set nickname = '한'
  where user_id = '20000000-0000-0000-0000-000000000002'$sql$, '23514');
select 'PASS: 계정 FK·프로필·통계 자동 생성·닉네임 중복/형식';

begin;
insert into public.matches (id, player1_id, player2_id, rules_version, server_instance_id)
values ('10000000-0000-0000-0000-000000000001',
  '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
  'erd-contract-test', 'isolated-postgres');
insert into public.match_participants (match_id, user_id, character_key) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'sword'),
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002', 'mage');
set constraints all immediate;
commit;

select test.expect_error($sql$insert into public.matches
  (id, player1_id, player2_id, rules_version, server_instance_id)
  values ('10000000-0000-0000-0000-000000000099',
    '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
    'test', 'test')$sql$, '23514', true);
select test.expect_error($sql$insert into public.match_participants (match_id,user_id,character_key)
  values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000003', 'archer')$sql$, '23514', true);
select test.expect_error($sql$update public.match_participants
  set user_id = '20000000-0000-0000-0000-000000000003'
  where match_id = '10000000-0000-0000-0000-000000000001'
    and user_id = '20000000-0000-0000-0000-000000000002'$sql$, '23514', true);
select test.expect_error($sql$delete from public.match_participants
  where match_id = '10000000-0000-0000-0000-000000000001'
    and user_id = '20000000-0000-0000-0000-000000000002'$sql$, '23514', true);
select test.expect_error($sql$update public.match_participants set character_key = 'unknown'
  where user_id = '20000000-0000-0000-0000-000000000001'$sql$, '23514');
select test.expect_error($sql$update public.match_participants set final_hp = 101
  where user_id = '20000000-0000-0000-0000-000000000001'$sql$, '23514');
select test.assert((select count(*) = 2 from public.match_participants), '거절 뒤 참가자 2행 유지');
select 'PASS: 참가자 정확히 2명·부모 계정 일치·변경/삭제 거절·캐릭터·체력';

select test.expect_error($sql$update public.matches set status = 'active'
  where id = '10000000-0000-0000-0000-000000000001'$sql$, '23514');
update public.matches set status = 'active', started_at = now()
  where id = '10000000-0000-0000-0000-000000000001';
select test.expect_error($sql$update public.matches set status = 'completed', ended_at = now(),
  winner_id = '20000000-0000-0000-0000-000000000001', reason = 'ko'
  where id = '10000000-0000-0000-0000-000000000001'$sql$, '23514', true);
select test.expect_error($sql$update public.matches set winner_id = '20000000-0000-0000-0000-000000000003'
  where id = '10000000-0000-0000-0000-000000000001'$sql$, '23514');
begin;
update public.matches set status = 'completed', ended_at = now(),
  winner_id = '20000000-0000-0000-0000-000000000001', reason = 'ko'
  where id = '10000000-0000-0000-0000-000000000001';
update public.match_participants set outcome = case
  when user_id = '20000000-0000-0000-0000-000000000001' then 'win' else 'loss' end,
  streak_before = 3, streak_after = case
  when user_id = '20000000-0000-0000-0000-000000000001' then 4 else 0 end,
  final_hp = case when user_id = '20000000-0000-0000-0000-000000000001' then 60 else 0 end
  where match_id = '10000000-0000-0000-0000-000000000001';
set constraints all immediate;
commit;
select test.expect_error($sql$update public.match_participants set outcome = 'draw'
  where user_id = '20000000-0000-0000-0000-000000000001'$sql$, '23514', true);
select test.expect_error($sql$delete from auth.users
  where id = '20000000-0000-0000-0000-000000000001'$sql$, '23503');
select test.assert((select count(*) = 3 from public.profiles), '계정 삭제 거절 시 프로필 삭제도 롤백');
select 'PASS: 상태·시각·승자·참가 결과 일치·경기 계정 삭제 보호';

begin;
insert into public.matches(id,player1_id,player2_id,rules_version,server_instance_id)
  values('10000000-0000-0000-0000-000000000098','20000000-0000-0000-0000-000000000001',
    '20000000-0000-0000-0000-000000000002','test','test');
insert into public.match_participants(match_id,user_id,character_key) values
  ('10000000-0000-0000-0000-000000000098','20000000-0000-0000-0000-000000000001','sword'),
  ('10000000-0000-0000-0000-000000000098','20000000-0000-0000-0000-000000000002','mage');
update public.matches set status='void',reason='disconnect',ended_at=now()
  where id='10000000-0000-0000-0000-000000000098';
set constraints all immediate;
select test.assert((select count(*)=2 from public.match_participants
  where match_id='10000000-0000-0000-0000-000000000098' and outcome is null and streak_after is null),
  '양쪽 연결 종료 무효는 확정 승패·연승을 만들지 않음');
rollback;
select 'PASS: 양쪽 연결 종료의 무효 사유·개인 결과 NULL';

insert into public.match_events (match_id,user_id,event_type,payload) values
  ('10000000-0000-0000-0000-000000000001',null,'settle_conflict','{"source":"test"}');
select test.expect_error($sql$insert into public.match_events (match_id,event_type,payload)
  values ('10000000-0000-0000-0000-000000000001','disconnect','[]')$sql$, '23514');
select test.expect_error($sql$insert into public.match_events (match_id,event_type)
  values ('10000000-0000-0000-0000-000000000099','disconnect')$sql$, '23503');

insert into public.active_participations (user_id,queue_or_match_id,state,lease_expires_at)
values ('20000000-0000-0000-0000-000000000001','queue-ticket-test','queued',now()+interval '30 seconds');
select test.expect_error($sql$insert into public.active_participations
  (user_id,queue_or_match_id,state,lease_expires_at)
  values ('20000000-0000-0000-0000-000000000001','other-ticket','queued',now())$sql$, '23505');
select 'PASS: 이벤트 FK·객체 payload·계정당 활성 참가 1행';

set role authenticated;
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000001',false);
select test.assert((select count(*) = 1 from public.matches), '참가자는 본인 경기 조회');
select test.assert((select count(*) = 1 from public.match_participants), '참가자는 자기 참가 행만 조회');
update public.profiles set nickname = '도전자_01'
  where user_id = '20000000-0000-0000-0000-000000000001';
update public.profiles set nickname = '조작불가'
  where user_id = '20000000-0000-0000-0000-000000000002';
select test.assert(not exists(select 1 from public.profiles where nickname = '조작불가'), '상대 닉네임 수정 거절');
select test.expect_error('update public.player_stats set wins = 999','42501');
select test.expect_error('delete from public.matches','42501');
select test.expect_error('select * from public.active_participations','42501');
select test.expect_error('select * from public.match_events','42501');
select test.expect_error('update public.profiles set created_at = now()','42501');
select set_config('request.jwt.claim.sub','20000000-0000-0000-0000-000000000003',false);
select test.assert((select count(*) = 0 from public.matches), '비참가자는 경기 조회 불가');
reset role;

set role anon;
select test.assert((select count(*) = 3 from public.profiles), '공개 프로필 읽기');
select test.assert((select count(*) = 3 from public.player_stats), '공개 순위 통계 읽기');
select test.expect_error('select * from public.matches','42501');
select test.expect_error('select * from auth.users','42501');
select test.expect_error('update public.player_stats set wins = 999','42501');
reset role;

set role service_role;
select test.assert((select count(*) = 1 from public.match_events), '서버 역할 이벤트 접근');
select test.assert((select count(*) = 1 from public.active_participations), '서버 역할 참가 잠금 접근');
reset role;
select 'PASS: 두 인증 계정·비참가자·익명·서버 역할의 RLS와 쓰기 권한';

-- 테스트 편의 삭제와 실제 운영의 보관 정책은 구분합니다.
delete from public.matches where id = '10000000-0000-0000-0000-000000000001';
select test.assert((select count(*) = 0 from public.match_participants), '경기 삭제의 참가 행 CASCADE');
select test.assert((select count(*) = 0 from public.match_events), '경기 삭제의 이벤트 CASCADE');
select 'PASS: ERD 데이터 계약 검증 완료 (정산 RPC·Supabase Auth 통합은 별도)';
