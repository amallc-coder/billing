-- ============================================================================
-- Claims Recovery — Row Level Security
--   admin  = COO  : full read/write + reassign + analytics
--   biller         : reads the shared worklist; edits claims assigned to them;
--                    comments on any claim
--   viewer         : read-only
-- ============================================================================

alter table profiles             enable row level security;
alter table recovery_settings    enable row level security;
alter table payer_filing_rules   enable row level security;
alter table upload_batches       enable row level security;
alter table claims               enable row level security;
alter table claim_status_history enable row level security;
alter table claim_comments       enable row level security;
alter table notifications        enable row level security;

-- ----------------------------------------------------------------------------
-- profiles
-- ----------------------------------------------------------------------------
drop policy if exists profiles_select on profiles;
create policy profiles_select on profiles
  for select to authenticated using (true);

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists profiles_admin_all on profiles;
create policy profiles_admin_all on profiles
  for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- ----------------------------------------------------------------------------
-- recovery_settings / payer_filing_rules : read all, admin writes
-- ----------------------------------------------------------------------------
drop policy if exists recovery_settings_select on recovery_settings;
create policy recovery_settings_select on recovery_settings
  for select to authenticated using (true);
drop policy if exists recovery_settings_admin on recovery_settings;
create policy recovery_settings_admin on recovery_settings
  for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

drop policy if exists payer_filing_rules_select on payer_filing_rules;
create policy payer_filing_rules_select on payer_filing_rules
  for select to authenticated using (true);
drop policy if exists payer_filing_rules_admin on payer_filing_rules;
create policy payer_filing_rules_admin on payer_filing_rules
  for all to authenticated
  using (auth_role() = 'admin') with check (auth_role() = 'admin');

-- ----------------------------------------------------------------------------
-- upload_batches : admin & biller create/read; admin deletes
-- ----------------------------------------------------------------------------
drop policy if exists upload_batches_select on upload_batches;
create policy upload_batches_select on upload_batches
  for select to authenticated using (true);
drop policy if exists upload_batches_insert on upload_batches;
create policy upload_batches_insert on upload_batches
  for insert to authenticated
  with check (auth_role() in ('admin', 'biller'));
drop policy if exists upload_batches_admin_delete on upload_batches;
create policy upload_batches_admin_delete on upload_batches
  for delete to authenticated using (auth_role() = 'admin');

-- ----------------------------------------------------------------------------
-- claims
--   select : everyone (shared worklist visibility)
--   insert : admin & biller (upload)
--   update : admin any; biller only their assigned claims
--   delete : admin
-- ----------------------------------------------------------------------------
drop policy if exists claims_select on claims;
create policy claims_select on claims
  for select to authenticated using (true);

drop policy if exists claims_insert on claims;
create policy claims_insert on claims
  for insert to authenticated
  with check (auth_role() in ('admin', 'biller'));

drop policy if exists claims_update on claims;
create policy claims_update on claims
  for update to authenticated
  using (auth_role() = 'admin' or (auth_role() = 'biller' and assigned_to = auth.uid()))
  with check (auth_role() = 'admin' or (auth_role() = 'biller' and assigned_to = auth.uid()));

drop policy if exists claims_admin_delete on claims;
create policy claims_admin_delete on claims
  for delete to authenticated using (auth_role() = 'admin');

-- ----------------------------------------------------------------------------
-- claim_status_history : read all; inserts happen via SECURITY DEFINER trigger
-- ----------------------------------------------------------------------------
drop policy if exists claim_status_history_select on claim_status_history;
create policy claim_status_history_select on claim_status_history
  for select to authenticated using (true);

-- ----------------------------------------------------------------------------
-- claim_comments : read all; admin & biller comment; authors edit/remove own
-- ----------------------------------------------------------------------------
drop policy if exists claim_comments_select on claim_comments;
create policy claim_comments_select on claim_comments
  for select to authenticated using (true);

drop policy if exists claim_comments_insert on claim_comments;
create policy claim_comments_insert on claim_comments
  for insert to authenticated
  with check (user_id = auth.uid() and auth_role() in ('admin', 'biller'));

drop policy if exists claim_comments_update_own on claim_comments;
create policy claim_comments_update_own on claim_comments
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists claim_comments_delete_own on claim_comments;
create policy claim_comments_delete_own on claim_comments
  for delete to authenticated
  using (user_id = auth.uid() or auth_role() = 'admin');

-- ----------------------------------------------------------------------------
-- notifications : recipients read & mark their own
-- ----------------------------------------------------------------------------
drop policy if exists notifications_select_own on notifications;
create policy notifications_select_own on notifications
  for select to authenticated using (user_id = auth.uid());
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications
  for insert to authenticated with check (auth_role() in ('admin', 'biller'));
drop policy if exists notifications_update_own on notifications;
create policy notifications_update_own on notifications
  for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
