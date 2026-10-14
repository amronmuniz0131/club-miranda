-- =========================================================
-- Guest players: admins can add players by name only (no account).
-- Idempotent — safe to run on a database that already has the base schema.
-- =========================================================

-- 1) Guests have no auth.users row, so drop that FK (safe for this app:
--    profiles are never deleted via auth user cascades in this project).
alter table public.profiles drop constraint if exists profiles_id_fkey;

-- 2) Auto-generate ids so the client can insert guests without one.
alter table public.profiles alter column id set default gen_random_uuid();

-- 3) Allow role = 'guest'.
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin', 'player', 'guest'));

-- 4) Admins may create guest profiles from the app.
drop policy if exists "profiles_admin_insert" on public.profiles;
create policy "profiles_admin_insert"
  on public.profiles for insert
  to authenticated
  with check (public.is_admin());
