-- ============================================================================
-- Billers work the shared worklist, so let any admin or biller update any
-- claim (viewers remain read-only). Previously billers could only edit claims
-- assigned to them, which locked them out of unassigned uploaded claims.
-- ============================================================================
drop policy if exists claims_update on claims;
create policy claims_update on claims for update to authenticated
  using (auth_role() in ('admin', 'biller'))
  with check (auth_role() in ('admin', 'biller'));
