-- Inkdom: accounts, points wallet, payments and cosmetics (INKDOM_Payments_Plan.md §5).
-- Players can READ only their own rows. All writes go through the SECURITY DEFINER
-- functions below, which only the service role (server) may execute.

-- ---------------------------------------------------------------- tables
create table if not exists public.profiles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  balance    integer not null default 0,
  loadout    jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.payments (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null references auth.users (id) on delete cascade,
  provider                text not null check (provider in ('stripe', 'nowpayments')),
  provider_ref            text,
  provider_payment_intent text,
  pack_id                 text not null check (char_length(pack_id) <= 40),
  points                  integer not null check (points > 0),
  amount_cents            integer not null check (amount_cents > 0),
  currency                text not null default 'usd' check (char_length(currency) = 3),
  status                  text not null default 'pending'
                            check (status in ('pending', 'paid', 'failed', 'expired', 'refunded')),
  provider_status         text check (char_length(provider_status) <= 60),
  created_at              timestamptz not null default now(),
  paid_at                 timestamptz,
  updated_at              timestamptz not null default now(),
  unique (provider, provider_ref)
);
create index if not exists payments_user_created_idx on public.payments (user_id, created_at desc);
create index if not exists payments_intent_idx on public.payments (provider_payment_intent) where provider_payment_intent is not null;

create table if not exists public.point_ledger (
  id            bigint generated always as identity primary key,
  user_id       uuid not null references auth.users (id) on delete cascade,
  delta         integer not null check (delta <> 0),
  reason        text not null check (reason in ('purchase', 'spend', 'refund', 'adjust')),
  payment_id    uuid references public.payments (id) on delete set null,
  item_id       text,
  balance_after integer not null,
  created_at    timestamptz not null default now()
);
create unique index if not exists point_ledger_payment_reason_uq on public.point_ledger (payment_id, reason) where payment_id is not null;
create index if not exists point_ledger_user_created_idx on public.point_ledger (user_id, created_at desc);

create table if not exists public.owned_items (
  user_id     uuid not null references auth.users (id) on delete cascade,
  item_id     text not null check (char_length(item_id) <= 40),
  price_paid  integer not null check (price_paid >= 0),
  acquired_at timestamptz not null default now(),
  primary key (user_id, item_id)
);

-- ---------------------------------------------------------------- RLS: read own rows only
alter table public.profiles     enable row level security;
alter table public.payments     enable row level security;
alter table public.point_ledger enable row level security;
alter table public.owned_items  enable row level security;

create policy "read own profile" on public.profiles     for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own payments" on public.payments    for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own ledger" on public.point_ledger  for select to authenticated using ((select auth.uid()) = user_id);
create policy "read own items" on public.owned_items    for select to authenticated using ((select auth.uid()) = user_id);

revoke insert, update, delete on public.profiles, public.payments, public.point_ledger, public.owned_items from anon, authenticated;

-- ---------------------------------------------------------------- profile per new user
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (user_id) values (new.id) on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------- credit a paid payment (idempotent)
create or replace function public.credit_payment(p_payment_id uuid, p_provider_status text, p_payment_intent text default null)
returns table (credited boolean, balance integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments%rowtype;
  v_bal integer;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment % not found', p_payment_id using errcode = 'P0002';
  end if;

  insert into public.profiles (user_id) values (v_pay.user_id) on conflict (user_id) do nothing;

  if v_pay.status in ('paid', 'refunded') then
    return query select false, (select p.balance from public.profiles p where p.user_id = v_pay.user_id);
    return;
  end if;

  update public.payments
     set status = 'paid', paid_at = now(), updated_at = now(),
         provider_status = left(p_provider_status, 60),
         provider_payment_intent = coalesce(p_payment_intent, provider_payment_intent)
   where id = v_pay.id;

  update public.profiles
     set balance = profiles.balance + v_pay.points, updated_at = now()
   where user_id = v_pay.user_id
   returning profiles.balance into v_bal;

  insert into public.point_ledger (user_id, delta, reason, payment_id, balance_after)
  values (v_pay.user_id, v_pay.points, 'purchase', v_pay.id, v_bal);

  return query select true, v_bal;
end;
$$;

-- ---------------------------------------------------------------- refund / chargeback (idempotent)
create or replace function public.refund_payment(p_payment_id uuid, p_provider_status text)
returns table (refunded boolean, balance integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.payments%rowtype;
  v_bal integer;
begin
  select * into v_pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'payment % not found', p_payment_id using errcode = 'P0002';
  end if;

  if v_pay.status <> 'paid' then
    return query select false, (select p.balance from public.profiles p where p.user_id = v_pay.user_id);
    return;
  end if;

  update public.payments
     set status = 'refunded', updated_at = now(), provider_status = left(p_provider_status, 60)
   where id = v_pay.id;

  -- The balance may go negative (points already spent); spending is then blocked.
  update public.profiles
     set balance = profiles.balance - v_pay.points, updated_at = now()
   where user_id = v_pay.user_id
   returning profiles.balance into v_bal;

  insert into public.point_ledger (user_id, delta, reason, payment_id, balance_after)
  values (v_pay.user_id, -v_pay.points, 'refund', v_pay.id, v_bal);

  return query select true, v_bal;
end;
$$;

-- ---------------------------------------------------------------- pending -> failed / expired, or status note
create or replace function public.mark_payment(p_payment_id uuid, p_status text, p_provider_status text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if p_status not in ('pending', 'failed', 'expired') then
    raise exception 'invalid status %', p_status;
  end if;
  update public.payments
     set status = p_status, provider_status = left(p_provider_status, 60), updated_at = now()
   where id = p_payment_id and status in ('pending', 'failed', 'expired');
  get diagnostics v_count = row_count;
  return v_count > 0;
end;
$$;

-- ---------------------------------------------------------------- spend points on an item (atomic)
create or replace function public.purchase_item(p_user_id uuid, p_item_id text, p_price integer)
returns table (ok boolean, error text, balance integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bal integer;
begin
  if p_price < 0 then
    raise exception 'invalid price';
  end if;

  insert into public.profiles (user_id) values (p_user_id) on conflict (user_id) do nothing;
  select p.balance into v_bal from public.profiles p where p.user_id = p_user_id for update;

  if exists (select 1 from public.owned_items o where o.user_id = p_user_id and o.item_id = p_item_id) then
    return query select false, 'already_owned'::text, v_bal;
    return;
  end if;
  if v_bal < p_price then
    return query select false, 'insufficient_points'::text, v_bal;
    return;
  end if;

  insert into public.owned_items (user_id, item_id, price_paid) values (p_user_id, p_item_id, p_price);

  update public.profiles
     set balance = profiles.balance - p_price, updated_at = now()
   where user_id = p_user_id
   returning profiles.balance into v_bal;

  if p_price > 0 then
    insert into public.point_ledger (user_id, delta, reason, item_id, balance_after)
    values (p_user_id, -p_price, 'spend', p_item_id, v_bal);
  end if;

  return query select true, null::text, v_bal;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.credit_payment(uuid, text, text) from public, anon, authenticated;
revoke all on function public.refund_payment(uuid, text) from public, anon, authenticated;
revoke all on function public.mark_payment(uuid, text, text) from public, anon, authenticated;
revoke all on function public.purchase_item(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.credit_payment(uuid, text, text) to service_role;
grant execute on function public.refund_payment(uuid, text) to service_role;
grant execute on function public.mark_payment(uuid, text, text) to service_role;
grant execute on function public.purchase_item(uuid, text, integer) to service_role;

-- ---------------------------------------------------------------- owner-only audit: balance must equal the ledger sum
create or replace view public.wallet_audit
with (security_invoker = true) as
select p.user_id,
       p.balance,
       coalesce(sum(l.delta), 0)::integer as ledger_sum,
       p.balance = coalesce(sum(l.delta), 0) as consistent
  from public.profiles p
  left join public.point_ledger l on l.user_id = p.user_id
 group by p.user_id, p.balance;

revoke all on public.wallet_audit from anon, authenticated;
