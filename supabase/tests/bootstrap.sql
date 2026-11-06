-- test-database.ts가 만든 폐기용 PostgreSQL 클러스터 전용입니다.
-- 실제 Supabase Auth/GoTrue를 설치하거나 대신 검증하는 파일이 아닙니다.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema auth;
create table auth.users (
  id uuid primary key,
  email varchar(255),
  email_confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to authenticated, anon, service_role;
grant execute on function auth.uid() to authenticated, anon, service_role;
