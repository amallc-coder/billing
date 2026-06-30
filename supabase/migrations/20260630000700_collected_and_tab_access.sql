-- ============================================================================
-- "Collected" confirmation (money actually received in the bank), distinct from
-- Payment Issued, plus per-user tab access for admin-managed logins.
-- ============================================================================

alter table claims add column if not exists collected boolean not null default false;
alter table claims add column if not exists collected_amount numeric(14,2);
alter table claims add column if not exists collected_at timestamptz;
alter table claims add column if not exists collected_by uuid references profiles (id);
create index if not exists claims_collected_idx on claims (collected);

-- Per-user tab access. NULL => derive defaults from role; otherwise an explicit
-- array of tab/sub-tab keys (e.g. ["dashboard","dashboard.aging","worklist"]).
alter table profiles add column if not exists allowed_tabs jsonb;

-- Let signed-in users append their own audit rows (changed_by must be self).
drop policy if exists claim_status_history_insert on claim_status_history;
create policy claim_status_history_insert on claim_status_history
  for insert to authenticated with check (changed_by = auth.uid());

-- Mark / unmark a claim as collected. SECURITY INVOKER so the claims UPDATE is
-- governed by RLS (admin any, biller only their assigned claims).
create or replace function mark_claim_collected(
  p_claim_id uuid, p_collected boolean, p_amount numeric default null, p_note text default null
) returns claims language plpgsql security invoker set search_path = public as $$
declare v claims;
begin
  update claims set
    collected        = p_collected,
    collected_amount = case when p_collected then coalesce(p_amount, collected_amount, balance) else null end,
    collected_at     = case when p_collected then now() else null end,
    collected_by     = case when p_collected then auth.uid() else null end,
    last_worked_at   = now()
  where id = p_claim_id
  returning * into v;

  if v.id is null then
    raise exception 'claim not found or not permitted';
  end if;

  insert into claim_status_history (claim_id, changed_by, note)
  values (
    p_claim_id, auth.uid(),
    (case when p_collected
          then 'Marked collected (in bank): ' || coalesce(p_amount::text, v.collected_amount::text)
          else 'Unmarked collected' end)
    || coalesce(' — ' || nullif(p_note, ''), '')
  );
  return v;
end;
$$;
revoke execute on function public.mark_claim_collected(uuid, boolean, numeric, text) from public, anon;
grant execute on function public.mark_claim_collected(uuid, boolean, numeric, text) to authenticated;
