-- Player skill levels: beginner, novice, intermediate, advanced, professional
-- null = not set yet. Idempotent.

alter table public.profiles add column if not exists level text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'profiles_level_check'
  ) then
    alter table public.profiles
      add constraint profiles_level_check
      check (level is null or level in (
        'beginner', 'novice', 'intermediate', 'advanced', 'professional'
      ));
  end if;
end $$;

-- verify
select column_name, data_type from information_schema.columns
where table_schema = 'public' and table_name = 'profiles' and column_name = 'level';
