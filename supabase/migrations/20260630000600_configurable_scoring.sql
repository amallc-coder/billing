-- ============================================================================
-- Configurable priority scoring & tier thresholds.
-- A single-row settings table the admin can tune; the derived-column functions
-- read from it instead of using hardcoded constants.
-- ============================================================================

create table if not exists scoring_settings (
  id                      int primary key default 1 check (id = 1),
  -- aging points (by bucket)
  aging_pts_0_30          numeric not null default 10,
  aging_pts_31_60         numeric not null default 25,
  aging_pts_61_90         numeric not null default 45,
  aging_pts_91_120        numeric not null default 70,
  aging_pts_120_plus      numeric not null default 90,
  -- balance points
  balance_per_dollar      numeric not null default 0.01,  -- points per $1 ($100 -> 1pt)
  balance_pts_cap         numeric not null default 100,
  -- timely-filing urgency boost
  deadline_within_30_pts  numeric not null default 100,
  deadline_within_60_pts  numeric not null default 50,
  -- tier thresholds
  tier_a_aging_days       int not null default 90,
  tier_a_balance          numeric not null default 1000,
  tier_a_deadline_days    int not null default 30,
  tier_b_aging_days       int not null default 61,
  tier_c_aging_days       int not null default 31,
  updated_at              timestamptz not null default now()
);
insert into scoring_settings (id) values (1) on conflict (id) do nothing;

alter table scoring_settings enable row level security;
drop policy if exists scoring_settings_select on scoring_settings;
create policy scoring_settings_select on scoring_settings for select to authenticated using (true);
drop policy if exists scoring_settings_admin on scoring_settings;
create policy scoring_settings_admin on scoring_settings for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

create or replace function claim_priority_for(p_days int, p_balance numeric, p_deadline date)
returns numeric language plpgsql stable set search_path = public as $$
declare s scoring_settings; v numeric; d int;
begin
  select * into s from scoring_settings where id = 1;
  if not found then
    return (case when p_days >= 120 then 90 when p_days >= 91 then 70
                 when p_days >= 61 then 45 when p_days >= 31 then 25 else 10 end)
         + least(coalesce(p_balance,0)/100.0, 100)
         + (case when p_deadline is null then 0
                 when (p_deadline - current_date) < 0 then 0
                 when (p_deadline - current_date) <= 30 then 100
                 when (p_deadline - current_date) <= 60 then 50 else 0 end);
  end if;
  v := (case
          when p_days >= 120 then s.aging_pts_120_plus
          when p_days >= 91  then s.aging_pts_91_120
          when p_days >= 61  then s.aging_pts_61_90
          when p_days >= 31  then s.aging_pts_31_60
          else s.aging_pts_0_30
        end)
     + least(coalesce(p_balance,0) * s.balance_per_dollar, s.balance_pts_cap);
  if p_deadline is not null then
    d := p_deadline - current_date;
    if d >= 0 and d <= 30 then v := v + s.deadline_within_30_pts;
    elsif d > 30 and d <= 60 then v := v + s.deadline_within_60_pts;
    end if;
  end if;
  return v;
end;
$$;

create or replace function claim_tier_for(p_days int, p_balance numeric, p_deadline date, p_status claim_status)
returns text language plpgsql stable set search_path = public as $$
declare s scoring_settings; d int;
begin
  select * into s from scoring_settings where id = 1;
  if not found then
    return case
      when p_days >= 90 or coalesce(p_balance,0) > 1000
        or (p_deadline is not null and (p_deadline - current_date) between 0 and 30) then 'A'
      when p_days >= 61 or p_status = 'denied' then 'B'
      when p_days >= 31 then 'C' else 'D' end;
  end if;
  d := case when p_deadline is null then null else p_deadline - current_date end;
  return case
    when p_days >= s.tier_a_aging_days
      or coalesce(p_balance,0) > s.tier_a_balance
      or (d is not null and d between 0 and s.tier_a_deadline_days) then 'A'
    when p_days >= s.tier_b_aging_days or p_status = 'denied' then 'B'
    when p_days >= s.tier_c_aging_days then 'C'
    else 'D'
  end;
end;
$$;

create or replace function recompute_claim_scores()
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if auth_role() <> 'admin' then raise exception 'admins only'; end if;
  update claims set balance = balance;
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.recompute_claim_scores() from public, anon;
grant execute on function public.recompute_claim_scores() to authenticated;
