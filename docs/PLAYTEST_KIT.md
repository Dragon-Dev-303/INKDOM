# Playtest kit (plan §9)

## Setup
- 10–20 sessions, 2 players each. Include some people who rarely play PC games.
- One laptop with an external keyboard if possible; production URL; Settings → "Share anonymous match stats" **on**.
- One facilitator with this sheet.

## Script (about 25 minutes)
1. **Intro (1 min):** "We're testing the game, not you. Please think aloud."
2. **Self-onboarding (2 min):** players open *How to Play* themselves. **Don't explain anything.**
3. **Play (12 min):** match 1, match 2 (*Swap Sides*), match 3 (players choose). Note confusion, quotes and bugs below.
4. **Rematch question (1 min):** ask "Would you like to play another round?" and record yes/no **before** anything else.
5. **Feedback (5 min):** each player fills in the in-game form (Home or Results → *Give feedback*).
6. **Wrap-up (1 min):** optionally click *Download match log* on the last Results screen.

## Facilitator notes (one per session)

| Field | Notes |
|---|---|
| Date / build version | |
| Players' gaming experience (low/med/high) | |
| Confusion moments (time, what happened) | |
| Bugs seen | |
| Voluntary rematch? (yes/no) | |
| Did they use squad commands unprompted? | |
| Quotes | |

## Metrics and targets (hypotheses from the brief)

| Metric | Where it comes from | Target |
|---|---|---|
| Match completion rate | `match_logs` vs sessions observed | ≥ 95% |
| Median match length | `select * from playtest_summary;` | 3–6 min |
| Voluntary rematch | Facilitator notes | ≥ 50% of testers |
| Objective understood | Feedback Q3 (scored against the real rule) | ≥ 80% |
| Time to first move / first hit | `match_logs.first_move_seconds`, `first_hit_seconds` | move < 10 s, hit < 45 s |
| Attacker win rate | `playtest_summary.attacker_win_pct` | 40–60% |
| Crashes | Facilitator notes | 0 |

Useful SQL (Supabase SQL editor):
```sql
select * from playtest_summary;
select build_version, count(*), avg(duration_seconds)/60 as avg_min,
       avg((first_move_seconds->>0)::numeric) as p1_first_move_s
from match_logs where p2_controller = 'HUMAN' group by build_version;
select fun_rating, controls_rating, bots_rating, objective_answer, confusing, bugs
from feedback order by created_at desc;
```

## Decision gate (brief §4)

| Outcome | Next step |
|---|---|
| All targets met | Plan Beta 2: online private 1v1 rooms |
| Fun met, stability not | Fix-up sprint, retest 5 sessions |
| Stability met, fun not | Tuning sprint on the top 3 complaints (`src/game/config/tuning.ts`), retest |
| Neither | Re-evaluate the concept before spending more |
