# Claims Recovery

An internal tool for working **unpaid / open insurance claims** and recovering
at-risk pipeline revenue before it ages out.

> Every dollar in this app is **pipeline / at-risk / recovered** revenue under
> active recovery — **never** booked or realized practice revenue. The starting
> universe is unpaid claims, so totals represent revenue *under recovery*, not
> revenue *generation*.

Built with **React + Vite** and **Supabase** (Auth, Postgres, Realtime, Storage).
The feature lives at the route **`/claims-recovery`**.

---

## What it does

- **Upload** claim-level extracts (CSV / XLSX) of open claims, map columns, validate,
  de-dupe on `source_claim_id`, and parse each row into an individual claim record.
- **Worklist** — a filterable, sortable, server-paginated table that surfaces the
  highest-dollar and most time-sensitive claims first via a computed **priority score**
  and **A/B/C/D tier**, with bulk assign / status / follow-up actions.
- **Claim detail** — an editable side drawer with a **status-history timeline** and a
  **realtime comment thread** (replies, @mentions, EOB/screenshot attachments).
- **Analytics** — a COO dashboard answering: how much is *still recoverable*, how much
  we've *recovered*, and how much we're *leaving on the table*.

## Status model

**Primary status** (drives the worklist): `pending_biller` → `pending_payer` →
`payment_issued` / `denied`.

**Resolution** (measures leakage): `appeal_filed`, `corrected_resubmitted`,
`underpaid_partial`, `written_off`, `timely_filing_expired`.

- **Recovered** = reached *Payment Issued* (full or partial) in this tool.
- **Left on the table** = *Written Off* or *Timely-Filing Expired*.
- **Still in play** = *Pending Biller* / *Pending Payer* / *Appeal Filed*.

Every status/resolution change is written to `claim_status_history` (who, when,
from→to, optional note) for time-in-status, recovery rate, and biller throughput.

---

## Getting started

### 1. Install

```bash
npm install
```

### 2. Configure Supabase

Create a Supabase project, then copy the env template and fill it in:

```bash
cp .env.example .env
```

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

> Only the **publishable (anon)** key belongs here — it ships to the browser and is
> protected by Row Level Security.

### 3. Apply the database schema

The SQL lives in [`supabase/migrations/`](./supabase/migrations). Apply it with the
Supabase CLI:

```bash
supabase db push
```

…or paste each migration (in filename order) into the Supabase SQL editor:

| File | Contents |
| --- | --- |
| `…000100_schema.sql` | enums, tables, indexes |
| `…000200_functions_triggers.sql` | derived columns (aging / tier / priority), history logging, `update_claim` / `upsert_claims` RPCs, timely-filing flagging |
| `…000300_rls.sql` | Row Level Security policies |
| `…000400_realtime_storage_seed.sql` | Realtime, Storage bucket, new-user trigger, seed settings |

### 4. Set roles

New sign-ups get the `viewer` role. Promote your COO/billers in the `profiles` table:

```sql
update profiles set role = 'admin'  where email = 'coo@example.com';
update profiles set role = 'biller' where email = 'biller@example.com';
```

- **admin** (COO): full analytics, reassignment, all edits.
- **biller**: works their assigned queue, comments on any claim.
- **viewer**: read-only.

### 5. Run

```bash
npm run dev      # http://localhost:5173
npm run build    # production build
```

A sample extract to try the upload flow lives at
[`samples/sample_claims.csv`](./samples/sample_claims.csv).

---

## Data model

`upload_batches`, `claims`, `claim_status_history`, `claim_comments`,
`notifications`, `profiles`, plus tunable `recovery_settings` (collection-probability
curve by aging bucket) and `payer_filing_rules` (per-payer timely-filing windows).
See the migrations for the authoritative definitions.

### Tuning the recovery model

`Expected recoverable` weights each open balance by a **configurable** collection
curve — not a single hardcoded rate. Adjust it any time:

```sql
update recovery_settings set collection_probability = 0.6 where aging_bucket = '61-90';
```

### Timely-filing

Deadlines come from the file when present, otherwise from `payer_filing_rules`
(`submit_date + filing_days`). Run the auto-flagger on a schedule (pg_cron) or on
demand to mark expired claims unrecoverable:

```sql
select flag_timely_filing_expired();
```

## Project structure

```
supabase/migrations/   SQL: schema, functions/triggers, RLS, realtime/storage/seed
src/
  lib/                 supabaseClient, constants, format, domain (classification & money framing)
  context/             AuthContext (session + role)
  hooks/               useProfiles, useRecoverySettings
  components/
    ui/                shared primitives (badges, cards, buttons…)
    upload/            UploadWizard — parse → map → validate → commit
    worklist/          Worklist — filters, sort, pagination, bulk actions, priority tiers
    claim/             ClaimDrawer — editable fields, status timeline, realtime comments
    analytics/         AnalyticsDashboard — top-line cards, breakdowns, RCM KPIs
  pages/               ClaimsRecovery (tabbed shell), Login
```
