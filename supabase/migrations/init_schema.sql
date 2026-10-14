-- =========================================================
-- PaddleStacker schema: profiles, sessions, session_players, matches
-- (tables are created before functions that reference them)
-- Guests are profiles with role = 'guest' (no auth account needed).
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- app_config (admin signup secret) ----------
create table if not exists public.app_config (
  key text primary key,
  value text not null
);

alter table public.app_config enable row level security;

insert into public.app_config (key, value)
values ('admin_signup_code', 'STACKER-ADMIN-2026')
on conflict (key) do nothing;

-- ---------- profiles ----------
-- Note: no FK to auth.users — guests are created by admins without an account.
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  email text,
  full_name text not null default '',
  role text not null default 'player' check (role in ('admin', 'player', 'guest')),
  level text check (level is null or level in (
    'beginner', 'novice', 'intermediate', 'advanced', 'professional'
  )),
  created_at timestamptz not null default now()
);

-- ---------- helper: is_admin() ----------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

revoke execute on function public.is_admin() from anon;
grant execute on function public.is_admin() to authenticated;

alter table public.profiles enable row level security;

create policy "profiles_read_authenticated"
  on public.profiles for select
  to authenticated
  using (true);

create policy "profiles_admin_update"
  on public.profiles for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "profiles_admin_insert"
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());

-- auto-create profile on signup; role = admin only when the admin code matches
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := 'player';
  v_code text;
begin
  if new.raw_user_meta_data->>'admin_code' is not null
     and new.raw_user_meta_data->>'admin_code' <> '' then
    select value into v_code from public.app_config where key = 'admin_signup_code';
    if v_code is not null and new.raw_user_meta_data->>'admin_code' = v_code then
      v_role := 'admin';
    end if;
  end if;

  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    v_role
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------- sessions ----------
create table if not exists public.sessions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  status text not null default 'active' check (status in ('active', 'ended')),
  courts_count int not null default 1 check (courts_count between 1 and 8),
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.sessions enable row level security;

create policy "sessions_read_authenticated"
  on public.sessions for select
  to authenticated
  using (true);

create policy "sessions_admin_insert"
  on public.sessions for insert
  to authenticated
  with check (public.is_admin());

create policy "sessions_admin_update"
  on public.sessions for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "sessions_admin_delete"
  on public.sessions for delete
  to authenticated
  using (public.is_admin());

-- ---------- session_players (the paddle stack queue) ----------
create table if not exists public.session_players (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  player_id uuid not null references public.profiles(id) on delete cascade,
  queue_position int not null default 0,
  games_played int not null default 0,
  wins int not null default 0,
  joined_at timestamptz not null default now(),
  unique (session_id, player_id)
);

alter table public.session_players enable row level security;

create policy "session_players_read_authenticated"
  on public.session_players for select
  to authenticated
  using (true);

create policy "session_players_admin_insert"
  on public.session_players for insert
  to authenticated
  with check (public.is_admin());

create policy "session_players_admin_update"
  on public.session_players for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "session_players_admin_delete"
  on public.session_players for delete
  to authenticated
  using (public.is_admin());

-- ---------- matches ----------
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions(id) on delete cascade,
  court_number int not null default 1,
  round_number int not null default 1,
  team1_player1 uuid references public.profiles(id),
  team1_player2 uuid references public.profiles(id),
  team2_player1 uuid references public.profiles(id),
  team2_player2 uuid references public.profiles(id),
  team1_score int,
  team2_score int,
  status text not null default 'upcoming' check (status in ('upcoming', 'in_progress', 'completed')),
  winner_team int check (winner_team in (1, 2)),
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

alter table public.matches enable row level security;

create policy "matches_read_authenticated"
  on public.matches for select
  to authenticated
  using (true);

create policy "matches_admin_insert"
  on public.matches for insert
  to authenticated
  with check (public.is_admin());

create policy "matches_admin_update"
  on public.matches for update
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

create policy "matches_admin_delete"
  on public.matches for delete
  to authenticated
  using (public.is_admin());

-- ---------- complete_match(): atomic score + requeue ----------
-- Winners re-enter the back of the queue first, then losers.
create or replace function public.complete_match(
  p_match_id uuid,
  p_team1_score int,
  p_team2_score int
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session uuid;
  v_status text;
  v_winner int;
  v_max_pos int;
  v_pos int;
  r record;
begin
  if not public.is_admin() then
    raise exception 'Only admins can complete matches';
  end if;

  if p_team1_score is null or p_team2_score is null
     or p_team1_score < 0 or p_team2_score < 0 then
    raise exception 'Invalid scores';
  end if;

  if p_team1_score = p_team2_score then
    raise exception 'Scores cannot be equal - pickleball has no draws';
  end if;

  select session_id, status into v_session, v_status
    from public.matches where id = p_match_id;

  if v_session is null then
    raise exception 'Match not found';
  end if;
  if v_status = 'completed' then
    raise exception 'Match is already completed';
  end if;

  if p_team1_score > p_team2_score then
    v_winner := 1;
  else
    v_winner := 2;
  end if;

  update public.matches
    set team1_score = p_team1_score,
        team2_score = p_team2_score,
        status = 'completed',
        winner_team = v_winner,
        completed_at = now()
    where id = p_match_id;

  select coalesce(max(queue_position), 0) into v_max_pos
    from public.session_players where session_id = v_session;
  v_pos := v_max_pos;

  for r in
    select * from (
      select 1 as ord, m.team1_player1 as pid, (v_winner = 1) as is_win
        from public.matches m where m.id = p_match_id
      union all
      select 2, m.team1_player2, (v_winner = 1)
        from public.matches m where m.id = p_match_id
      union all
      select 3, m.team2_player1, (v_winner = 2)
        from public.matches m where m.id = p_match_id
      union all
      select 4, m.team2_player2, (v_winner = 2)
        from public.matches m where m.id = p_match_id
    ) t
    order by t.is_win desc, t.ord
  loop
    v_pos := v_pos + 1;
    update public.session_players
      set queue_position = v_pos,
          games_played = games_played + 1,
          wins = wins + case when r.is_win then 1 else 0 end
      where session_id = v_session and player_id = r.pid;
  end loop;
end;
$$;

revoke execute on function public.complete_match(uuid, int, int) from anon;
grant execute on function public.complete_match(uuid, int, int) to authenticated;

-- ---------- backfill profiles for pre-existing auth users ----------
-- Users who signed up before this schema existed get profile rows now.
-- Admin role is granted when their stored admin_code matches the configured code.
insert into public.profiles (id, email, full_name, role)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'full_name', ''),
  case
    when u.raw_user_meta_data->>'admin_code' is not null
     and u.raw_user_meta_data->>'admin_code'
       = (select value from public.app_config where key = 'admin_signup_code')
    then 'admin'
    else 'player'
  end
from auth.users u
on conflict (id) do nothing;

-- ---------- realtime ----------
do $$
begin
  alter publication supabase_realtime add table public.matches;
exception when others then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.session_players;
exception when others then null;
end $$;
