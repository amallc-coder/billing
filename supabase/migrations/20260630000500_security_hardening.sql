-- ============================================================================
-- Claims Recovery — security hardening
-- Addresses Supabase database-linter advisories:
--   * function_search_path_mutable
--   * anon/authenticated_security_definer_function_executable
-- ============================================================================

-- 1. Pin search_path on derived helper functions so it is no longer mutable.
alter function public.claim_aging_days(date, date) set search_path = public;
alter function public.aging_bucket_for(int) set search_path = public;
alter function public.timely_filing_deadline_for(text, payer_type, date) set search_path = public;
alter function public.claim_tier_for(int, numeric, date, claim_status) set search_path = public;
alter function public.claim_priority_for(int, numeric, date) set search_path = public;
alter function public.compute_claim_derived() set search_path = public;

-- 2. Trigger-only functions must not be reachable as RPCs. Triggers continue to
--    fire regardless of EXECUTE grants, so revoking is safe.
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_claim_status_change() from public, anon, authenticated;

-- 3. Maintenance routine: scheduled / service-role only (the app never calls it).
--    Schedule via pg_cron, e.g.:
--    select cron.schedule('flag-tfl', '0 6 * * *', $$ select public.flag_timely_filing_expired(); $$);
revoke execute on function public.flag_timely_filing_expired() from public, anon, authenticated;

-- 4. Internal role helper: required by RLS (authenticated) but not by anon/public.
revoke execute on function public.auth_role() from public, anon;
grant execute on function public.auth_role() to authenticated;

-- 5. Bulk-import RPC: signed-in uploaders only (internally gated to admin/biller).
revoke execute on function public.upsert_claims(uuid, jsonb) from public, anon;
grant execute on function public.upsert_claims(uuid, jsonb) to authenticated;
