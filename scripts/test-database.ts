import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** DATABASE_URL/기존 PostgreSQL을 사용하지 않고 매번 폐기용 Unix socket 클러스터를 만듭니다. */
const root = resolve(import.meta.dirname, '..');
for (const name of ['initdb', 'pg_ctl', 'psql']) {
  const check = spawnSync(name, ['--version'], { encoding: 'utf8' });
  if (check.error || check.status !== 0)
    throw new Error(`${name}가 필요합니다. PostgreSQL 16 이상을 설치하세요.`);
}
// macOS의 긴 TMPDIR 대신 짧고 독립된 소켓 경로를 사용합니다.
const folder = mkdtempSync('/tmp/deathmatch-db-test-');
const data = join(folder, 'data'),
  socket = join(folder, 'socket');
mkdirSync(socket);
const inherited = Object.fromEntries(
  Object.entries(process.env).filter(([key]) => !key.startsWith('PG')),
);
const env = {
  ...inherited,
  PGHOST: socket,
  PGPORT: '6543',
  PGUSER: 'postgres',
  PGDATABASE: 'deathmatch_contract_test',
  PGSSLMODE: 'disable',
  PGCONNECT_TIMEOUT: '5',
};
function run(command: string, args: string[]): string {
  const result = spawnSync(command, args, { env, encoding: 'utf8', timeout: 30_000 });
  if (result.error || result.status !== 0)
    throw new Error(`${command} 실패: ${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result.stdout;
}
let startAttempted = false;
function verifyUpgradeGuard(): void {
  const database = 'deathmatch_upgrade_guard_test';
  run('psql', [
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-d',
    'postgres',
    '-c',
    `create database ${database} template deathmatch_contract_test;`,
  ]);
  run('psql', [
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-d',
    database,
    '-c',
    `
    insert into auth.users(id) values
      ('30000000-0000-0000-0000-000000000001'),('30000000-0000-0000-0000-000000000002');
    insert into public.matches(id,player_a,player_b,rules_version,server_instance_id)
      values('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002','legacy','test');
    insert into public.match_participants(match_id,user_id) values
      ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001'),
      ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002');`,
  ]);
  const rejected = spawnSync(
    'psql',
    [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-d',
      database,
      '-f',
      join(root, 'supabase/migrations/202611060002_align_erd.sql'),
    ],
    { env, encoding: 'utf8', timeout: 30_000 },
  );
  if (rejected.error || rejected.status === 0 || !rejected.stderr.includes('백필 계획'))
    throw new Error('기존 경기의 캐릭터 백필 없는 업그레이드가 안전하게 거절되지 않았습니다.');
  const preserved = run('psql', [
    '-X',
    '-A',
    '-t',
    '-v',
    'ON_ERROR_STOP=1',
    '-d',
    database,
    '-c',
    `
    select (select count(*) = 2 from public.match_participants)
      and exists(select 1 from information_schema.columns where table_schema='public'
        and table_name='matches' and column_name='player_a')
      and to_regclass('public.match_events') is null;`,
  ]);
  if (preserved.trim() !== 't')
    throw new Error('중단된 업그레이드가 기존 스키마·행을 보존하지 못했습니다.');
  console.log('PASS: 기존 기록 이관 요구·migration 롤백·원본 데이터 보존');
}
function verifyReviewMigrationGuard(): void {
  const database = 'deathmatch_review_guard_test';
  run('psql', [
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-d',
    'postgres',
    '-c',
    `create database ${database} template deathmatch_contract_test;`,
  ]);
  run('psql', [
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-d',
    database,
    '-c',
    `
    insert into auth.users(id) values
      ('30000000-0000-0000-0000-000000000001'),('30000000-0000-0000-0000-000000000002');
    insert into public.matches(id,player1_id,player2_id,status,reason,winner_id,started_at,ended_at,rules_version,server_instance_id)
      values('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001',
      '30000000-0000-0000-0000-000000000002','completed','ko','30000000-0000-0000-0000-000000000001',now(),now(),'legacy','test');
    insert into public.match_participants(match_id,user_id,character_key,outcome,streak_before,streak_after,final_hp) values
      ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','sword','win',0,1,0),
      ('40000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000002','mage','loss',0,0,60);`,
  ]);
  const rejected = spawnSync(
    'psql',
    [
      '-X',
      '-v',
      'ON_ERROR_STOP=1',
      '-d',
      database,
      '-f',
      join(root, 'supabase/migrations/202611060003_review_integrity.sql'),
    ],
    { env, encoding: 'utf8', timeout: 30_000 },
  );
  if (rejected.error || rejected.status === 0 || !rejected.stderr.includes('최종 체력'))
    throw new Error('003이 기존의 모순된 KO 결과를 안전하게 거절하지 못했습니다.');
  const preserved = run('psql', [
    '-X',
    '-A',
    '-t',
    '-v',
    'ON_ERROR_STOP=1',
    '-d',
    database,
    '-c',
    `
    select (select count(*)=2 from public.match_participants)
      and not exists(select 1 from pg_constraint where conname='matches_void_reason_required')
      and to_regprocedure('public.assert_match_result_health(uuid)') is null
      and has_table_privilege('service_role','public.match_participants','TRUNCATE');`,
  ]);
  if (preserved.trim() !== 't')
    throw new Error('003 중단 시 데이터·제약·함수·권한 롤백에 실패했습니다.');
  console.log('PASS: 003의 기존 모순 결과 거절·데이터·권한·DDL 롤백');
}
try {
  run('initdb', ['-D', data, '-U', 'postgres', '-A', 'trust', '--no-locale', '--encoding=UTF8']);
  startAttempted = true;
  run('pg_ctl', [
    '-D',
    data,
    '-l',
    join(folder, 'postgres.log'),
    '-o',
    `-F -c listen_addresses='' -k ${socket} -p 6543`,
    '-w',
    '-t',
    '15',
    'start',
  ]);
  run('psql', [
    '-X',
    '-v',
    'ON_ERROR_STOP=1',
    '-d',
    'postgres',
    '-c',
    'create database deathmatch_contract_test;',
  ]);
  run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', join(root, 'supabase/tests/bootstrap.sql')]);
  for (const name of readdirSync(join(root, 'supabase/migrations'))
    .filter((p) => p.endsWith('.sql'))
    .sort()) {
    if (name === '202611060002_align_erd.sql') verifyUpgradeGuard();
    if (name === '202611060003_review_integrity.sql') verifyReviewMigrationGuard();
    run('psql', ['-X', '-v', 'ON_ERROR_STOP=1', '-f', join(root, 'supabase/migrations', name)]);
    console.log(`PASS: migration ${name}`);
  }
  const output = run('psql', [
    '-X',
    '-A',
    '-t',
    '-v',
    'ON_ERROR_STOP=1',
    '-f',
    join(root, 'supabase/tests/erd-contracts.sql'),
  ]);
  for (const line of output.split('\n').filter((line) => line.startsWith('PASS:')))
    console.log(line);
} catch (error) {
  const logs = join(folder, 'postgres.log');
  try {
    console.error(readFileSync(logs, 'utf8').split('\n').slice(-12).join('\n'));
  } catch {
    /* 초기화 전 실패 */
  }
  throw error;
} finally {
  if (
    startAttempted &&
    spawnSync('pg_ctl', ['-D', data, 'status'], { env, encoding: 'utf8' }).status === 0
  )
    run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', '-t', '10', 'stop']);
  rmSync(folder, { recursive: true, force: true });
}
