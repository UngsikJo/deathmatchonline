-- Development schema draft. Apply to a dedicated Supabase test project first.
-- No client-side match or statistics writes. Settlement RPC is a later migration.
begin;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  nickname text not null check (char_length(nickname) between 2 and 12 and nickname ~ '^[가-힣A-Za-z0-9_]+$'),
  nickname_normalized text generated always as (lower(nickname)) stored unique,
  created_at timestamptz not null default now()
);

create table public.player_stats (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  current_streak integer not null default 0 check (current_streak >= 0),
  best_streak integer not null default 0 check (best_streak >= current_streak),
  best_streak_achieved_at timestamptz,
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0)
);

create index player_stats_leaderboard on public.player_stats
  (best_streak desc, best_streak_achieved_at asc nulls last, user_id);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  player_a uuid references public.profiles(user_id) on delete set null,
  player_b uuid references public.profiles(user_id) on delete set null,
  winner_id uuid references public.profiles(user_id) on delete set null,
  status text not null default 'preparing'
    check (status in ('preparing', 'active', 'finalizing', 'completed', 'cancelled', 'void')),
  reason text check (reason in ('ko', 'timeout', 'draw', 'surrender', 'disconnect', 'server_failure')),
  rules_version text not null,
  server_instance_id text not null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz,
  check (player_a is null or player_b is null or player_a <> player_b),
  check (winner_id is null or winner_id = player_a or winner_id = player_b)
);

create index matches_player_a on public.matches (player_a, created_at desc);
create index matches_player_b on public.matches (player_b, created_at desc);

create table public.match_participants (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references public.profiles(user_id) on delete cascade,
  outcome text check (outcome in ('win', 'loss', 'draw', 'void')),
  streak_before integer not null default 0 check (streak_before >= 0),
  streak_after integer check (streak_after >= 0),
  final_hp integer check (final_hp between 0 and 100),
  primary key (match_id, user_id)
);

create table public.active_participations (
  user_id uuid primary key references public.profiles(user_id) on delete cascade,
  queue_or_match_id text not null,
  state text not null check (state in ('queued', 'preparing', 'active', 'finalizing')),
  lease_expires_at timestamptz not null
);

alter table public.profiles enable row level security;
alter table public.player_stats enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.active_participations enable row level security;

revoke all on public.profiles, public.player_stats, public.matches,
  public.match_participants, public.active_participations from anon, authenticated;
grant select on public.profiles, public.player_stats to anon, authenticated;
grant update (nickname) on public.profiles to authenticated;
grant select on public.matches, public.match_participants to authenticated;

create policy profiles_public_read on public.profiles for select to anon, authenticated using (true);
create policy profiles_owner_update on public.profiles for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy stats_public_read on public.player_stats for select to anon, authenticated using (true);
create policy matches_participant_read on public.matches for select to authenticated
  using ((select auth.uid()) = player_a or (select auth.uid()) = player_b);
create policy participant_self_read on public.match_participants for select to authenticated
  using ((select auth.uid()) = user_id);

-- Do not trust signup metadata for privileged fields or guaranteed-unique nicknames.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  initial_nickname text;
begin
  loop
    initial_nickname := 'u_' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 10);
    begin
      insert into public.profiles (user_id, nickname) values (new.id, initial_nickname);
      exit;
    exception when unique_violation then
      if exists (select 1 from public.profiles where user_id = new.id) then
        return new;
      end if;
    end;
  end loop;
  insert into public.player_stats (user_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.handle_new_user() from public, anon, authenticated;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

commit;
