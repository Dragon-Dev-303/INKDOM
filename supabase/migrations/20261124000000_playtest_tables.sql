-- Inkdom beta: anonymous playtest storage (brief §5, §11; plan §5.7, §9).
-- The web app inserts with the publishable (anon) key. Row-level security allows
-- INSERT only: nobody can read rows through the public API. View the data in the
-- Supabase dashboard (SQL editor / table editor) or with the service role.

create table if not exists public.match_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null check (char_length(session_id) between 8 and 64),
  build_version text not null check (char_length(build_version) between 1 and 32),
  seed integer not null,
  p1_team text not null check (p1_team in ('ATTACKER', 'DEFENDER')),
  p2_controller text not null check (p2_controller in ('HUMAN', 'CPU')),
  winner text not null check (winner in ('ATTACKER', 'DEFENDER')),
  end_reason text not null check (end_reason in ('CAPTURE', 'TIMEOUT')),
  duration_seconds numeric(7, 2) not null check (duration_seconds between 0 and 3600),
  attacker_kos integer not null check (attacker_kos between 0 and 10000),
  defender_kos integer not null check (defender_kos between 0 and 10000),
  peak_capture numeric(4, 3) not null check (peak_capture between 0 and 1),
  stuck_events integer not null default 0 check (stuck_events between 0 and 10000),
  first_move_seconds jsonb not null default '[null, null]'::jsonb check (jsonb_typeof(first_move_seconds) = 'array'),
  first_hit_seconds jsonb not null default '[null, null]'::jsonb check (jsonb_typeof(first_hit_seconds) = 'array'),
  events jsonb not null default '[]'::jsonb check (jsonb_typeof(events) = 'array' and pg_column_size(events) < 300000)
);

create index if not exists match_logs_created_at_idx on public.match_logs (created_at desc);
create index if not exists match_logs_session_idx on public.match_logs (session_id);

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  session_id text not null check (char_length(session_id) between 8 and 64),
  build_version text not null check (char_length(build_version) between 1 and 32),
  preferred_side text check (preferred_side in ('ATTACKER', 'DEFENDER', 'SAME')),
  fun_rating smallint check (fun_rating between 1 and 5),
  objective_answer text not null default '' check (char_length(objective_answer) <= 2000),
  controls_rating smallint check (controls_rating between 1 and 5),
  awkward_actions text not null default '' check (char_length(awkward_actions) <= 2000),
  used_commands text not null default '' check (char_length(used_commands) <= 2000),
  bots_rating smallint check (bots_rating between 1 and 5),
  unfair text not null default '' check (char_length(unfair) <= 2000),
  confusing text not null default '' check (char_length(confusing) <= 2000),
  bugs text not null default '' check (char_length(bugs) <= 2000),
  play_online text check (play_online in ('YES', 'MAYBE', 'NO')),
  other text not null default '' check (char_length(other) <= 2000)
);

create index if not exists feedback_created_at_idx on public.feedback (created_at desc);

alter table public.match_logs enable row level security;
alter table public.feedback enable row level security;

drop policy if exists "anon can insert match logs" on public.match_logs;
create policy "anon can insert match logs" on public.match_logs
  for insert to anon with check (true);

drop policy if exists "anon can insert feedback" on public.feedback;
create policy "anon can insert feedback" on public.feedback
  for insert to anon with check (true);

-- Playtest metrics for the owner (plan §9.3). security_invoker keeps RLS in force,
-- so this view returns nothing to the anon role; query it from the dashboard.
create or replace view public.playtest_summary with (security_invoker = true) as
select
  count(*)                                                           as matches,
  round(avg(duration_seconds) / 60, 2)                               as avg_minutes,
  round((percentile_cont(0.5) within group (order by duration_seconds))::numeric / 60, 2) as median_minutes,
  round(avg(case when winner = 'ATTACKER' then 1 else 0 end) * 100, 1) as attacker_win_pct,
  round(avg(case when end_reason = 'CAPTURE' then 1 else 0 end) * 100, 1) as capture_end_pct,
  sum(stuck_events)                                                  as stuck_level3_events,
  count(distinct session_id)                                         as sessions
from public.match_logs
where p2_controller = 'HUMAN';

revoke all on public.playtest_summary from anon, authenticated;
