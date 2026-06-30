-- ============================================================================
-- Claims Recovery — realtime, storage, auth wiring, and seed defaults
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Realtime: stream claims and claim_comments to connected clients.
-- ----------------------------------------------------------------------------
do $$ begin
  alter publication supabase_realtime add table claims;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table claim_comments;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- Auth: auto-create a profile row when a user signs up.
-- ----------------------------------------------------------------------------
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    'viewer'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ----------------------------------------------------------------------------
-- Storage: private bucket for claim attachments (EOBs, payer screenshots).
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('claim-attachments', 'claim-attachments', false)
on conflict (id) do nothing;

drop policy if exists claim_attachments_read on storage.objects;
create policy claim_attachments_read on storage.objects
  for select to authenticated
  using (bucket_id = 'claim-attachments');

drop policy if exists claim_attachments_write on storage.objects;
create policy claim_attachments_write on storage.objects
  for insert to authenticated
  with check (bucket_id = 'claim-attachments' and auth_role() in ('admin', 'biller'));

drop policy if exists claim_attachments_delete on storage.objects;
create policy claim_attachments_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'claim-attachments' and (owner = auth.uid() or auth_role() = 'admin'));

-- ----------------------------------------------------------------------------
-- Seed: configurable collection-probability curve by aging bucket.
-- Tune these to change "Expected recoverable" without touching code.
-- ----------------------------------------------------------------------------
insert into recovery_settings (aging_bucket, collection_probability, sort_order) values
  ('0-30',   0.85, 1),
  ('31-60',  0.70, 2),
  ('61-90',  0.50, 3),
  ('91-120', 0.30, 4),
  ('120+',   0.12, 5)
on conflict (aging_bucket) do nothing;

-- ----------------------------------------------------------------------------
-- Seed: default timely-filing windows by payer type (days from submit_date).
-- ----------------------------------------------------------------------------
insert into payer_filing_rules (payer_type, payer_name, filing_days) values
  ('commercial', null, 180),
  ('medicare',   null, 365),
  ('medicaid',   null, 365),
  ('self_pay',   null, 365),
  ('other',      null, 180)
on conflict (payer_type, coalesce(payer_name, '')) do nothing;
