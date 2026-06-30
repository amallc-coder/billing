-- ============================================================================
-- Claims Recovery — core schema
-- Universe = UNPAID / open insurance claims under active recovery.
-- All dollar figures represent at-risk / pipeline revenue, never booked revenue.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Enums
-- ----------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'biller', 'viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type payer_type as enum ('commercial', 'medicare', 'medicaid', 'self_pay', 'other');
exception when duplicate_object then null; end $$;

-- Primary status — single value per claim, drives the worklist.
do $$ begin
  create type claim_status as enum ('pending_biller', 'pending_payer', 'payment_issued', 'denied');
exception when duplicate_object then null; end $$;

-- Resolution / outcome — required to measure leakage.
do $$ begin
  create type claim_resolution as enum (
    'appeal_filed',
    'corrected_resubmitted',
    'underpaid_partial',
    'written_off',
    'timely_filing_expired'
  );
exception when duplicate_object then null; end $$;

-- Captured when status = payment_issued.
do $$ begin
  create type payment_type as enum ('full', 'partial');
exception when duplicate_object then null; end $$;

-- ----------------------------------------------------------------------------
-- profiles  (1:1 with auth.users; carries the role)
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  email       text,
  full_name   text,
  role        user_role not null default 'viewer',
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- recovery_settings  (configurable collection-probability curve by aging bucket)
-- Tunable — do NOT hardcode a single recovery rate.
-- ----------------------------------------------------------------------------
create table if not exists recovery_settings (
  aging_bucket           text primary key,
  collection_probability numeric not null check (collection_probability between 0 and 1),
  sort_order             int  not null default 0
);

-- ----------------------------------------------------------------------------
-- payer_filing_rules  (per-payer timely-filing window used to derive deadlines)
-- payer_name null => default rule for the payer_type.
-- ----------------------------------------------------------------------------
create table if not exists payer_filing_rules (
  id          uuid primary key default gen_random_uuid(),
  payer_type  payer_type,
  payer_name  text,
  filing_days int not null check (filing_days > 0),
  created_at  timestamptz not null default now()
);
create unique index if not exists payer_filing_rules_type_name_uidx
  on payer_filing_rules (payer_type, coalesce(payer_name, ''));

-- ----------------------------------------------------------------------------
-- upload_batches
-- ----------------------------------------------------------------------------
create table if not exists upload_batches (
  id             uuid primary key default gen_random_uuid(),
  filename       text not null,
  uploaded_by    uuid references profiles (id),
  uploaded_at    timestamptz not null default now(),
  row_count      int not null default 0,
  column_mapping jsonb not null default '{}'::jsonb
);

-- ----------------------------------------------------------------------------
-- claims
-- ----------------------------------------------------------------------------
create table if not exists claims (
  id                     uuid primary key default gen_random_uuid(),
  batch_id               uuid references upload_batches (id) on delete set null,

  -- identity / source
  source_claim_id        text not null,
  patient_acct           text,

  -- payer
  payer_name             text,
  payer_type             payer_type,

  -- org
  subsidiary             text,          -- AMMO / AMAZ / AMGA (mapped from facility if absent)
  facility               text,
  provider               text,

  -- service / billing
  service_date           date,          -- DOS
  submit_date            date,          -- original submission
  cpt                    text,
  service_line           text,
  billed_amount          numeric(14,2),
  expected_amount        numeric(14,2), -- contractual / allowed, nullable
  balance                numeric(14,2) not null default 0,

  -- denial detail
  denial_code            text,          -- CARC
  denial_remark          text,          -- RARC
  timely_filing_deadline date,

  -- workflow
  status                 claim_status not null default 'pending_biller',
  resolution             claim_resolution,
  payment_type           payment_type,  -- full / partial when status = payment_issued
  assigned_to            uuid references profiles (id),
  next_action            text,
  follow_up_date         date,

  -- computed (maintained by trigger)
  priority_score         numeric not null default 0,
  aging_bucket           text,
  tier                   text,          -- A / B / C / D

  last_worked_at         timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint claims_source_claim_id_key unique (source_claim_id)
);

create index if not exists claims_status_idx        on claims (status);
create index if not exists claims_resolution_idx    on claims (resolution);
create index if not exists claims_assigned_to_idx   on claims (assigned_to);
create index if not exists claims_tier_idx          on claims (tier);
create index if not exists claims_aging_bucket_idx  on claims (aging_bucket);
create index if not exists claims_payer_name_idx    on claims (payer_name);
create index if not exists claims_subsidiary_idx    on claims (subsidiary);
create index if not exists claims_batch_idx         on claims (batch_id);
-- Default worklist sort: tier asc, balance desc, oldest service_date asc.
create index if not exists claims_worklist_sort_idx on claims (tier, balance desc, service_date);

-- ----------------------------------------------------------------------------
-- claim_status_history  (append-only audit of status/resolution transitions)
-- ----------------------------------------------------------------------------
create table if not exists claim_status_history (
  id              uuid primary key default gen_random_uuid(),
  claim_id        uuid not null references claims (id) on delete cascade,
  from_status     claim_status,
  to_status       claim_status,
  from_resolution claim_resolution,
  to_resolution   claim_resolution,
  changed_by      uuid references profiles (id),
  note            text,
  changed_at      timestamptz not null default now()
);
create index if not exists claim_status_history_claim_idx on claim_status_history (claim_id, changed_at);
create index if not exists claim_status_history_changed_by_idx on claim_status_history (changed_by, changed_at);

-- ----------------------------------------------------------------------------
-- claim_comments  (per-claim threaded internal conversation)
-- ----------------------------------------------------------------------------
create table if not exists claim_comments (
  id             uuid primary key default gen_random_uuid(),
  claim_id       uuid not null references claims (id) on delete cascade,
  user_id        uuid not null references profiles (id),
  body           text not null,
  parent_id      uuid references claim_comments (id) on delete cascade,
  attachment_url text,
  mentions       jsonb not null default '[]'::jsonb, -- array of mentioned profile ids
  created_at     timestamptz not null default now()
);
create index if not exists claim_comments_claim_idx  on claim_comments (claim_id, created_at);
create index if not exists claim_comments_parent_idx on claim_comments (parent_id);

-- ----------------------------------------------------------------------------
-- notifications  (in-app, for @mentions and new comments on watched claims)
-- ----------------------------------------------------------------------------
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles (id) on delete cascade,
  claim_id    uuid references claims (id) on delete cascade,
  comment_id  uuid references claim_comments (id) on delete cascade,
  kind        text not null default 'mention',  -- mention | comment | assignment
  body        text,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists notifications_user_unread_idx on notifications (user_id, read_at, created_at);
