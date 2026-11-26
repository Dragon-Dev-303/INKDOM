-- Inkdom v2: usernames for sign-up, and online match history (INKDOM_v2_Plan.md §4.3, §5).
-- Requires 20261124010000_points_payments.sql (profiles table + handle_new_user trigger).

-- ---------------------------------------------------------------- usernames
alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists display_name text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_username_format') then
    alter table public.profiles
      add constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_]{3,20}$');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_display_name_len') then
    alter table public.profiles
      add constraint profiles_display_name_len check (display_name is null or char_length(display_name) between 1 and 32);
  end if;
end $$;

create unique index if not exists profiles_username_uq on public.profiles (username);

-- Unique username from sign-up metadata. On a clash (race between the availability check
-- and sign-up) a numeric suffix is added, so creating the auth user never fails here.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_base text;
  v_name text;
  v_try integer := 0;
begin
  v_base := lower(coalesce(new.raw_user_meta_data ->> 'username', split_part(coalesce(new.email, ''), '@', 1), ''));
  v_base := regexp_replace(v_base, '[^a-z0-9_]', '', 'g');
  if char_length(v_base) < 3 then
    v_base := 'player';
  end if;
  v_base := left(v_base, 16);
  v_name := v_base;
  while exists (select 1 from public.profiles p where p.username = v_name) and v_try < 25 loop
    v_try := v_try + 1;
    v_name := v_base || (1000 + floor(random() * 9000))::integer::text;
  end loop;

  insert into public.profiles (user_id, username, display_name)
  values (new.id, v_name, left(coalesce(nullif(new.raw_user_meta_data ->> 'display_name', ''), v_name), 32))
  on conflict (user_id) do update
    set username = coalesce(public.profiles.username, excluded.username),
        display_name = coalesce(public.profiles.display_name, excluded.display_name);
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- Backfill accounts created before this migration.
update public.profiles
   set username = 'player' || substr(replace(user_id::text, '-', ''), 1, 10),
       display_name = coalesce(display_name, 'player' || substr(replace(user_id::text, '-', ''), 1, 10))
 where username is null;

-- ---------------------------------------------------------------- online match history
create table if not exists public.online_matches (
  id               uuid primary key default gen_random_uuid(),
  room_code        text check (char_length(room_code) <= 12),
  attacker_user    uuid references auth.users (id) on delete set null,
  defender_user    uuid references auth.users (id) on delete set null,
  attacker_name    text check (char_length(attacker_name) <= 32),
  defender_name    text check (char_length(defender_name) <= 32),
  winner           text not null check (winner in ('ATTACKER', 'DEFENDER')),
  reason           text not null check (reason in ('CAPTURE', 'TIMEOUT')),
  duration_seconds numeric(8, 2) not null check (duration_seconds >= 0),
  attacker_kos     integer not null default 0,
  defender_kos     integer not null default 0,
  disconnects      integer not null default 0,
  build_version    text not null check (char_length(build_version) <= 32),
  seed             bigint,
  created_at       timestamptz not null default now()
);
create index if not exists online_matches_attacker_idx on public.online_matches (attacker_user, created_at desc);
create index if not exists online_matches_defender_idx on public.online_matches (defender_user, created_at desc);

alter table public.online_matches enable row level security;
create policy "players read own online matches" on public.online_matches
  for select to authenticated
  using ((select auth.uid()) in (attacker_user, defender_user));
revoke insert, update, delete on public.online_matches from anon, authenticated;
