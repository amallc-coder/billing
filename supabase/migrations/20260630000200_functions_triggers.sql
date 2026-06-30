-- ============================================================================
-- Claims Recovery — functions & triggers
-- Derived columns (aging_bucket, tier, priority_score, timely_filing_deadline)
-- and append-only status/resolution history logging.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- auth_role(): current user's role, SECURITY DEFINER to avoid RLS recursion.
-- ----------------------------------------------------------------------------
create or replace function auth_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid();
$$;

-- ----------------------------------------------------------------------------
-- aging helpers
-- ----------------------------------------------------------------------------
create or replace function claim_aging_days(p_service date, p_submit date)
returns int
language sql
immutable
as $$
  select greatest(0, (current_date - coalesce(p_service, p_submit, current_date)));
$$;

create or replace function aging_bucket_for(p_days int)
returns text
language sql
immutable
as $$
  select case
    when p_days is null   then null
    when p_days <= 30     then '0-30'
    when p_days <= 60     then '31-60'
    when p_days <= 90     then '61-90'
    when p_days <= 120    then '91-120'
    else '120+'
  end;
$$;

-- ----------------------------------------------------------------------------
-- resolve timely-filing deadline from a per-payer rule when absent in the file.
-- payer_name match wins over payer_type default.
-- ----------------------------------------------------------------------------
create or replace function timely_filing_deadline_for(p_payer_name text, p_payer_type payer_type, p_submit date)
returns date
language sql
stable
as $$
  select case
    when p_submit is null then null
    else p_submit + (
      select filing_days from payer_filing_rules
      where (payer_name = p_payer_name) or (payer_name is null and payer_type = p_payer_type)
      order by (payer_name is not null) desc
      limit 1
    )
  end;
$$;

-- ----------------------------------------------------------------------------
-- tier: A urgent / B / C / D monitor   (section 6)
-- ----------------------------------------------------------------------------
create or replace function claim_tier_for(
  p_days int, p_balance numeric, p_deadline date, p_status claim_status
) returns text
language sql
stable
as $$
  select case
    when p_days >= 90
      or coalesce(p_balance, 0) > 1000
      or (p_deadline is not null and (p_deadline - current_date) between 0 and 30)
      then 'A'
    when p_days >= 61 or p_status = 'denied' then 'B'
    when p_days >= 31 then 'C'
    else 'D'
  end;
$$;

-- ----------------------------------------------------------------------------
-- priority_score: financial exposure + aging + timely-filing proximity.
-- ----------------------------------------------------------------------------
create or replace function claim_priority_for(
  p_days int, p_balance numeric, p_deadline date
) returns numeric
language sql
stable
as $$
  select
    -- aging component
    (case
      when p_days >= 120 then 90
      when p_days >= 91  then 70
      when p_days >= 61  then 45
      when p_days >= 31  then 25
      else 10
    end)
    -- balance component ($100 = 1 pt, capped at 100)
    + least(coalesce(p_balance, 0) / 100.0, 100)
    -- timely-filing proximity boost
    + (case
        when p_deadline is null then 0
        when (p_deadline - current_date) < 0 then 0           -- already expired = dead, no boost
        when (p_deadline - current_date) <= 30 then 100
        when (p_deadline - current_date) <= 60 then 50
        else 0
      end);
$$;

-- ----------------------------------------------------------------------------
-- BEFORE INSERT/UPDATE: maintain derived columns + updated_at.
-- ----------------------------------------------------------------------------
create or replace function compute_claim_derived()
returns trigger
language plpgsql
as $$
declare
  v_days int;
begin
  if new.timely_filing_deadline is null then
    new.timely_filing_deadline := timely_filing_deadline_for(new.payer_name, new.payer_type, new.submit_date);
  end if;

  v_days := claim_aging_days(new.service_date, new.submit_date);
  new.aging_bucket   := aging_bucket_for(v_days);
  new.tier           := claim_tier_for(v_days, new.balance, new.timely_filing_deadline, new.status);
  new.priority_score := claim_priority_for(v_days, new.balance, new.timely_filing_deadline);
  new.updated_at     := now();
  return new;
end;
$$;

drop trigger if exists trg_compute_claim_derived on claims;
create trigger trg_compute_claim_derived
  before insert or update on claims
  for each row execute function compute_claim_derived();

-- ----------------------------------------------------------------------------
-- AFTER UPDATE: log status/resolution transitions to claim_status_history.
-- changed_by = auth.uid(); optional note read from a transaction-local GUC
-- set by the update_claim() RPC.
-- ----------------------------------------------------------------------------
create or replace function log_claim_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.status is distinct from old.status)
     or (new.resolution is distinct from old.resolution) then
    insert into claim_status_history (
      claim_id, from_status, to_status, from_resolution, to_resolution, changed_by, note
    ) values (
      new.id, old.status, new.status, old.resolution, new.resolution, auth.uid(),
      nullif(current_setting('app.change_note', true), '')
    );
  end if;
  return new;
end;
$$;

drop trigger if exists trg_log_claim_status_change on claims;
create trigger trg_log_claim_status_change
  after update on claims
  for each row execute function log_claim_status_change();

-- ----------------------------------------------------------------------------
-- update_claim(): single entry point for field edits, carries an optional
-- note into the history trigger and stamps last_worked_at.
-- ----------------------------------------------------------------------------
create or replace function update_claim(p_claim_id uuid, p_patch jsonb, p_note text default null)
returns claims
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_claim claims;
begin
  perform set_config('app.change_note', coalesce(p_note, ''), true);

  update claims set
    status         = coalesce((p_patch->>'status')::claim_status, status),
    resolution     = case when p_patch ? 'resolution'
                          then nullif(p_patch->>'resolution', '')::claim_resolution else resolution end,
    payment_type   = case when p_patch ? 'payment_type'
                          then nullif(p_patch->>'payment_type', '')::payment_type else payment_type end,
    assigned_to    = case when p_patch ? 'assigned_to'
                          then nullif(p_patch->>'assigned_to', '')::uuid else assigned_to end,
    next_action    = case when p_patch ? 'next_action'    then p_patch->>'next_action' else next_action end,
    follow_up_date = case when p_patch ? 'follow_up_date'
                          then nullif(p_patch->>'follow_up_date', '')::date else follow_up_date end,
    denial_code    = case when p_patch ? 'denial_code'    then p_patch->>'denial_code' else denial_code end,
    denial_remark  = case when p_patch ? 'denial_remark'  then p_patch->>'denial_remark' else denial_remark end,
    balance        = case when p_patch ? 'balance'
                          then nullif(p_patch->>'balance', '')::numeric else balance end,
    expected_amount= case when p_patch ? 'expected_amount'
                          then nullif(p_patch->>'expected_amount', '')::numeric else expected_amount end,
    last_worked_at = now()
  where id = p_claim_id
  returning * into v_claim;

  return v_claim;
end;
$$;

-- ----------------------------------------------------------------------------
-- upsert_claims(): batch import with de-dupe on source_claim_id.
-- On conflict, refresh financial/denial fields but NEVER silently overwrite a
-- manually-advanced status — flag those via the returned conflict report.
-- ----------------------------------------------------------------------------
create or replace function upsert_claims(p_batch_id uuid, p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r            jsonb;
  v_existing   claims;
  v_inserted   int := 0;
  v_updated    int := 0;
  v_flagged    jsonb := '[]'::jsonb;
begin
  -- Bulk import is a privileged action: only uploaders may run it. Runs as
  -- definer so a re-upload can refresh balances on claims a biller isn't
  -- individually assigned to (the per-claim RLS update guard would block that).
  if auth_role() not in ('admin', 'biller') then
    raise exception 'not authorized to import claims';
  end if;

  for r in select * from jsonb_array_elements(p_rows)
  loop
    select * into v_existing from claims where source_claim_id = r->>'source_claim_id';

    if v_existing.id is null then
      insert into claims (
        batch_id, source_claim_id, patient_acct, payer_name, payer_type, subsidiary,
        facility, provider, service_date, submit_date, cpt, service_line,
        billed_amount, expected_amount, balance, denial_code, denial_remark, timely_filing_deadline
      ) values (
        p_batch_id, r->>'source_claim_id', r->>'patient_acct', r->>'payer_name',
        nullif(r->>'payer_type','')::payer_type, r->>'subsidiary',
        r->>'facility', r->>'provider',
        nullif(r->>'service_date','')::date, nullif(r->>'submit_date','')::date,
        r->>'cpt', r->>'service_line',
        nullif(r->>'billed_amount','')::numeric, nullif(r->>'expected_amount','')::numeric,
        coalesce(nullif(r->>'balance','')::numeric, 0),
        r->>'denial_code', r->>'denial_remark',
        nullif(r->>'timely_filing_deadline','')::date
      );
      v_inserted := v_inserted + 1;
    else
      -- Refresh balance/denial/financial fields from the new extract.
      update claims set
        batch_id        = p_batch_id,
        balance         = coalesce(nullif(r->>'balance','')::numeric, balance),
        billed_amount   = coalesce(nullif(r->>'billed_amount','')::numeric, billed_amount),
        expected_amount = coalesce(nullif(r->>'expected_amount','')::numeric, expected_amount),
        denial_code     = coalesce(nullif(r->>'denial_code',''), denial_code),
        denial_remark   = coalesce(nullif(r->>'denial_remark',''), denial_remark)
      where id = v_existing.id;
      v_updated := v_updated + 1;

      -- Flag when the claim has been manually advanced beyond the default queue,
      -- so the importer can surface it instead of silently overwriting work.
      if v_existing.status <> 'pending_biller' then
        v_flagged := v_flagged || jsonb_build_object(
          'source_claim_id', v_existing.source_claim_id,
          'current_status',  v_existing.status
        );
      end if;
    end if;
  end loop;

  return jsonb_build_object('inserted', v_inserted, 'updated', v_updated, 'flagged', v_flagged);
end;
$$;

-- ----------------------------------------------------------------------------
-- flag_timely_filing_expired(): auto-flag open claims past their deadline.
-- Run on a schedule (pg_cron) or on demand from the app.
-- ----------------------------------------------------------------------------
create or replace function flag_timely_filing_expired()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  perform set_config('app.change_note', 'Auto-flagged: past timely-filing deadline', true);
  with expired as (
    update claims set resolution = 'timely_filing_expired'
    where timely_filing_deadline is not null
      and timely_filing_deadline < current_date
      and status in ('pending_biller', 'pending_payer', 'denied')
      and resolution is distinct from 'timely_filing_expired'
    returning 1
  )
  select count(*) into v_count from expired;
  return v_count;
end;
$$;
