// ============================================================================
// Domain constants — single source of truth for enums, labels, colors.
// Mirrors the Postgres enums in supabase/migrations.
// ============================================================================

// Brand palette
export const BRAND = {
  navy: '#002855',
  navyLight: '#1b3a63',
  cyan: '#29ABE2',
  cyanLight: '#e6f6fd',
  ink: '#0f1b2d',
  slate: '#5b6b82',
  line: '#e3e8ef',
  bg: '#f5f7fa',
  surface: '#ffffff',
  good: '#1f9d6b',
  goodBg: '#e6f6ef',
  warn: '#c8821a',
  warnBg: '#fdf3e3',
  bad: '#c0392b',
  badBg: '#fbeae8',
}

// --- Primary status (drives the worklist) -----------------------------------
export const STATUS = {
  pending_biller: 'pending_biller',
  pending_payer: 'pending_payer',
  payment_issued: 'payment_issued',
  denied: 'denied',
}

export const STATUSES = [
  {
    value: 'pending_biller',
    label: 'Pending Biller',
    color: BRAND.cyan,
    description: 'Needs action — sitting in a biller’s queue (default on upload).',
  },
  {
    value: 'pending_payer',
    label: 'Pending Payer',
    color: '#6c5ce7',
    description: 'Worked & submitted/resubmitted/appealed — awaiting payer response.',
  },
  {
    value: 'payment_issued',
    label: 'Payment Issued',
    color: BRAND.good,
    description: 'Payer paid (capture full or partial).',
  },
  {
    value: 'denied',
    label: 'Denied',
    color: BRAND.bad,
    description: 'Payer denied — requires a decision (appeal, correct & resubmit, or write off).',
  },
]

// --- Resolution / outcome ---------------------------------------------------
export const RESOLUTION = {
  appeal_filed: 'appeal_filed',
  corrected_resubmitted: 'corrected_resubmitted',
  underpaid_partial: 'underpaid_partial',
  written_off: 'written_off',
  timely_filing_expired: 'timely_filing_expired',
}

export const RESOLUTIONS = [
  { value: 'appeal_filed', label: 'Appeal Filed', color: '#6c5ce7' },
  { value: 'corrected_resubmitted', label: 'Corrected & Resubmitted', color: BRAND.cyan },
  { value: 'underpaid_partial', label: 'Underpaid / Partial Pay', color: BRAND.warn },
  { value: 'written_off', label: 'Written Off / Unrecoverable', color: BRAND.bad },
  { value: 'timely_filing_expired', label: 'Timely-Filing Expired', color: '#7b4b2a' },
]

// --- Payment type -----------------------------------------------------------
export const PAYMENT_TYPES = [
  { value: 'full', label: 'Full' },
  { value: 'partial', label: 'Partial' },
]

// --- Payer type -------------------------------------------------------------
export const PAYER_TYPES = [
  { value: 'commercial', label: 'Commercial' },
  { value: 'medicare', label: 'Medicare' },
  { value: 'medicaid', label: 'Medicaid' },
  { value: 'self_pay', label: 'Self-Pay' },
  { value: 'other', label: 'Other' },
]

// --- Roles ------------------------------------------------------------------
export const ROLES = [
  { value: 'admin', label: 'Admin (COO)' },
  { value: 'biller', label: 'Biller' },
  { value: 'viewer', label: 'Viewer' },
]

// --- Aging buckets (ascending) ----------------------------------------------
export const AGING_BUCKETS = ['0-30', '31-60', '61-90', '91-120', '120+']

// --- Tiers ------------------------------------------------------------------
export const TIERS = {
  A: { label: 'A · Urgent', color: BRAND.bad, bg: BRAND.badBg },
  B: { label: 'B', color: BRAND.warn, bg: BRAND.warnBg },
  C: { label: 'C', color: BRAND.cyan, bg: BRAND.cyanLight },
  D: { label: 'D · Monitor', color: BRAND.slate, bg: '#eef1f5' },
}
export const TIER_ORDER = ['A', 'B', 'C', 'D']

// --- Classification groups (analytics framing) ------------------------------
// Recovered = reached Payment Issued through this tool.
export const RECOVERED_STATUSES = ['payment_issued']
// Left on table = resolved unrecoverable.
export const LEFT_ON_TABLE_RESOLUTIONS = ['written_off', 'timely_filing_expired']
// Still in play = open and being worked.
export const IN_PLAY_STATUSES = ['pending_biller', 'pending_payer']
export const IN_PLAY_RESOLUTIONS = ['appeal_filed']

// Fallback collection-probability curve, overridden by recovery_settings table.
export const DEFAULT_COLLECTION_CURVE = {
  '0-30': 0.85,
  '31-60': 0.7,
  '61-90': 0.5,
  '91-120': 0.3,
  '120+': 0.12,
}

// Lookup helpers
const byValue = (arr) => Object.fromEntries(arr.map((x) => [x.value, x]))
export const STATUS_BY_VALUE = byValue(STATUSES)
export const RESOLUTION_BY_VALUE = byValue(RESOLUTIONS)
export const PAYER_TYPE_BY_VALUE = byValue(PAYER_TYPES)
export const PAYMENT_TYPE_BY_VALUE = byValue(PAYMENT_TYPES)
export const ROLE_BY_VALUE = byValue(ROLES)

export const statusLabel = (v) => STATUS_BY_VALUE[v]?.label ?? '—'
export const resolutionLabel = (v) => RESOLUTION_BY_VALUE[v]?.label ?? '—'
export const payerTypeLabel = (v) => PAYER_TYPE_BY_VALUE[v]?.label ?? '—'
