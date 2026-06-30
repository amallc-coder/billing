// ============================================================================
// Mapping + normalization helpers for the Upload flow.
//  - TARGET_FIELDS    : ordered list of target claim fields (+ required flag)
//  - REQUIRED_FIELDS  : the subset that must be present for a row to commit
//  - autoMatch()      : guess target->source mapping from header aliases
//  - normalizeMoney() / normalizeDate() / normalizePayerType()
//  - applyMapping()   : produce normalized commit-ready rows + validation stats
// All output values are STRINGS (or '') per the upsert_claims RPC contract.
// ============================================================================

export const TARGET_FIELDS = [
  { key: 'source_claim_id', label: 'Claim ID', required: true, kind: 'text' },
  { key: 'payer_name', label: 'Payer Name', required: true, kind: 'text' },
  { key: 'balance', label: 'Open Balance', required: true, kind: 'money' },
  { key: 'service_date', label: 'Service Date (DOS)', required: true, kind: 'date' },
  { key: 'patient_acct', label: 'Patient Account', required: false, kind: 'text' },
  { key: 'payer_type', label: 'Payer Type', required: false, kind: 'payer_type' },
  { key: 'subsidiary', label: 'Subsidiary', required: false, kind: 'text' },
  { key: 'facility', label: 'Facility', required: false, kind: 'text' },
  { key: 'provider', label: 'Provider', required: false, kind: 'text' },
  { key: 'submit_date', label: 'Submit Date', required: false, kind: 'date' },
  { key: 'cpt', label: 'CPT / Procedure', required: false, kind: 'text' },
  { key: 'service_line', label: 'Service Line', required: false, kind: 'text' },
  { key: 'billed_amount', label: 'Billed Amount', required: false, kind: 'money' },
  { key: 'expected_amount', label: 'Expected Amount', required: false, kind: 'money' },
  { key: 'denial_code', label: 'Denial Code', required: false, kind: 'text' },
  { key: 'denial_remark', label: 'Denial Remark', required: false, kind: 'text' },
  { key: 'timely_filing_deadline', label: 'Timely Filing Deadline', required: false, kind: 'date' },
]

export const REQUIRED_FIELDS = TARGET_FIELDS.filter((f) => f.required).map((f) => f.key)

// ----------------------------------------------------------------------------
// Calc config — lets the user CHOOSE how `balance` and `timely_filing_deadline`
// are determined, separate from the plain target->source `mapping`.
//   calc.balance = { mode: 'column' | 'calc', base, subtract: [] }
//   calc.timely_filing_deadline = { mode: 'column' | 'calc' | 'auto', base, days }
// Defaults keep current behavior: mode 'column' = use the mapped column as-is.
// ----------------------------------------------------------------------------
export function defaultCalc() {
  return {
    balance: { mode: 'column', base: '', subtract: [] },
    timely_filing_deadline: { mode: 'column', base: 'submit_date', days: 180 },
  }
}

// Whether all required target fields are satisfied given the current mapping +
// calc. `balance` is satisfied by a mapped column OR a valid calc base; every
// other required field still just needs a mapped source column.
export function requiredSatisfied(mapping, calc) {
  const c = calc || defaultCalc()
  return REQUIRED_FIELDS.every((key) => {
    if (key === 'balance') {
      const b = c.balance || { mode: 'column' }
      if (b.mode === 'calc') return !!b.base
      return !!mapping[key]
    }
    return !!mapping[key]
  })
}

// Loose alias lists used for auto-matching source headers to target fields.
const ALIASES = {
  source_claim_id: ['claim', 'claim #', 'claim number', 'claimid', 'claim id', 'claimno'],
  patient_acct: ['patient acct', 'patient account', 'account', 'acct', 'mrn', 'patient id'],
  payer_name: ['payer', 'payor', 'insurance', 'carrier', 'plan'],
  payer_type: ['payer type', 'payor type', 'insurance type', 'plan type', 'financial class'],
  subsidiary: ['subsidiary', 'entity', 'group', 'company'],
  facility: ['facility', 'location', 'site', 'place of service', 'pos'],
  provider: ['provider', 'rendering provider', 'physician', 'doctor', 'npi'],
  service_date: ['dos', 'service date', 'date of service', 'svc date'],
  submit_date: ['submit date', 'submission date', 'billed date', 'claim date', 'filed date'],
  cpt: ['cpt', 'procedure', 'proc code', 'hcpcs', 'code'],
  service_line: ['service line', 'specialty', 'department', 'dept'],
  billed_amount: ['billed', 'billed amount', 'charges', 'charge amount', 'total charges'],
  expected_amount: ['expected', 'expected amount', 'allowed', 'allowed amount', 'contractual', 'contract amount'],
  balance: ['balance', 'open balance', 'ar balance', 'outstanding', 'amount due', 'patient balance', 'insurance balance'],
  denial_code: ['denial code', 'carc', 'reason code', 'adjustment code'],
  denial_remark: ['denial remark', 'rarc', 'remark code', 'remark', 'denial reason'],
  timely_filing_deadline: ['timely filing', 'tfl', 'filing deadline', 'timely filing deadline'],
}

// Collapse a header/alias to a comparison key: lowercase, strip spaces/_/#/-/punct.
function canon(s) {
  return String(s == null ? '' : s)
    .toLowerCase()
    .replace(/[\s_#-]+/g, '')
    .replace(/[^a-z0-9]/g, '')
}

// Best-guess mapping target->source. First an exact canonical match against an
// alias, then a contains-match, so "Claim Number" matches alias "claim".
export function autoMatch(headers) {
  const canonHeaders = headers.map((h) => ({ raw: h, c: canon(h) }))
  const used = new Set()
  const mapping = {}

  for (const field of TARGET_FIELDS) {
    const aliases = (ALIASES[field.key] || []).map(canon)
    let match = null

    // Pass 1: exact canonical equality.
    for (const h of canonHeaders) {
      if (used.has(h.raw)) continue
      if (aliases.includes(h.c)) {
        match = h.raw
        break
      }
    }
    // Pass 2: header contains an alias (or vice-versa) for longer aliases.
    if (!match) {
      for (const h of canonHeaders) {
        if (used.has(h.raw)) continue
        if (aliases.some((a) => a.length >= 3 && (h.c.includes(a) || a.includes(h.c)) && h.c.length > 0)) {
          match = h.raw
          break
        }
      }
    }

    if (match) {
      mapping[field.key] = match
      used.add(match)
    } else {
      mapping[field.key] = ''
    }
  }
  return mapping
}

// --- Value normalizers ------------------------------------------------------

// "$1,234.50" / "(45.00)" / " 1 200 " → "1234.50" / "-45.00" / "1200". '' if blank.
export function normalizeMoney(value) {
  if (value == null) return ''
  let s = String(value).trim()
  if (!s) return ''
  let negative = false
  // Parentheses denote negative in accounting exports.
  if (/^\(.*\)$/.test(s)) {
    negative = true
    s = s.slice(1, -1)
  }
  if (s.includes('-')) negative = true
  // Strip currency symbols, thousands separators, spaces, stray chars.
  s = s.replace(/[$,\s]/g, '').replace(/[^0-9.]/g, '')
  if (!s || s === '.') return ''
  const n = Number(s)
  if (!Number.isFinite(n)) return ''
  const signed = negative ? -Math.abs(n) : n
  return String(signed)
}

const MS_PER_DAY = 86400000

function pad2(n) {
  return String(n).padStart(2, '0')
}

function ymd(y, m, d) {
  return `${y}-${pad2(m)}-${pad2(d)}`
}

// Excel serial date → JS Date (1900 date system, accounting for the 1900 leap bug).
function excelSerialToDate(serial) {
  // 25569 = days between 1899-12-30 epoch and 1970-01-01.
  const ms = Math.round((serial - 25569) * MS_PER_DAY)
  return new Date(ms)
}

// Accepts M/D/YYYY, MM/DD/YYYY, YYYY-MM-DD, ISO datetimes, and Excel serials.
// Returns 'YYYY-MM-DD' or '' when unparseable/blank.
export function normalizeDate(value) {
  if (value == null) return ''
  const s = String(value).trim()
  if (!s) return ''

  // ISO YYYY-MM-DD (optionally with time) — take the date portion as-is.
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
  if (iso) {
    const y = Number(iso[1])
    const m = Number(iso[2])
    const d = Number(iso[3])
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) return ymd(y, m, d)
    return ''
  }

  // US M/D/YYYY or M/D/YY (also tolerates dashes/dots as separators).
  const us = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/)
  if (us) {
    let mo = Number(us[1])
    let da = Number(us[2])
    let yr = Number(us[3])
    if (us[3].length === 2) yr += yr < 70 ? 2000 : 1900
    if (mo >= 1 && mo <= 12 && da >= 1 && da <= 31) return ymd(yr, mo, da)
    return ''
  }

  // Pure number → Excel serial date.
  if (/^\d+(\.\d+)?$/.test(s)) {
    const serial = Number(s)
    // Plausible serial range (≈ 1909–2065); below that it's not a date.
    if (serial > 3000 && serial < 60000) {
      const dt = excelSerialToDate(serial)
      if (!Number.isNaN(dt.getTime())) {
        return ymd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
      }
    }
    return ''
  }

  // Last resort: let the engine try (handles "Jan 5 2024" etc.).
  const parsed = new Date(s)
  if (!Number.isNaN(parsed.getTime())) {
    return ymd(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate())
  }
  return ''
}

// Add `n` whole days to a 'YYYY-MM-DD' string, returning 'YYYY-MM-DD'. Uses UTC
// math to avoid timezone/DST drift. Returns '' if the input isn't a valid date.
export function addDays(ymdStr, n) {
  if (ymdStr == null) return ''
  const s = String(ymdStr).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return ''
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return ''
  const base = Date.UTC(y, mo - 1, d)
  if (Number.isNaN(base)) return ''
  const days = Number(n)
  const shifted = new Date(base + (Number.isFinite(days) ? days : 0) * MS_PER_DAY)
  if (Number.isNaN(shifted.getTime())) return ''
  return ymd(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, shifted.getUTCDate())
}

// Map a free-text payer/financial-class value to the payer_type enum.
const PAYER_TYPE_HINTS = [
  { type: 'medicare', re: /\bmedicare\b|\bmcr\b|\bmcare\b/ },
  { type: 'medicaid', re: /\bmedicaid\b|\bmcd\b|\bmcaid\b|\bmedi-?cal\b/ },
  { type: 'self_pay', re: /self\s*-?\s*pay|\bpatient\b|\bguarantor\b|\bcash\b|uninsured/ },
  { type: 'commercial', re: /commercial|\bbcbs\b|blue\s*cross|blue\s*shield|aetna|cigna|united|uhc|humana|anthem|\bppo\b|\bhmo\b|\bepo\b|\bppos?\b/ },
]

export function normalizePayerType(value) {
  if (value == null) return ''
  const s = String(value).trim().toLowerCase()
  if (!s) return ''
  // Direct enum value passthrough.
  if (['commercial', 'medicare', 'medicaid', 'self_pay', 'other'].includes(s.replace(/[\s-]+/g, '_'))) {
    return s.replace(/[\s-]+/g, '_')
  }
  for (const hint of PAYER_TYPE_HINTS) {
    if (hint.re.test(s)) return hint.type
  }
  // Non-empty but unrecognized → 'other'.
  return 'other'
}

// Normalize a single source value according to a target field's kind.
function normalizeByKind(kind, value) {
  switch (kind) {
    case 'money':
      return normalizeMoney(value)
    case 'date':
      return normalizeDate(value)
    case 'payer_type':
      return normalizePayerType(value)
    default: {
      const s = value == null ? '' : String(value).trim()
      return s
    }
  }
}

// Apply mapping (+ optional calc config) to source rows. Returns:
//   { rows, total, committable, skipped, totalBalance, totalBilled, distinctPayers }
//   each item in rows: { values:{...normalized}, missing:[requiredKeys], ok:bool }
// `calc` (defaults to defaultCalc()) lets `balance` and `timely_filing_deadline`
// be computed instead of mapped directly. See defaultCalc() for its shape.
export function applyMapping(sourceRows, mapping, calc) {
  const cfg = calc || defaultCalc()
  const balanceCfg = cfg.balance || { mode: 'column' }
  const tflCfg = cfg.timely_filing_deadline || { mode: 'column' }

  const out = []
  let committable = 0
  let totalBalance = 0
  let totalBilled = 0
  const payers = new Set()

  for (const src of sourceRows) {
    const values = {}
    for (const field of TARGET_FIELDS) {
      const sourceHeader = mapping[field.key]
      const raw = sourceHeader ? src[sourceHeader] : ''
      values[field.key] = normalizeByKind(field.kind, raw)
    }

    // --- Open Balance: optionally compute base − (term1 + term2 + …) ---------
    if (balanceCfg.mode === 'calc') {
      const baseStr = balanceCfg.base ? normalizeMoney(src[balanceCfg.base]) : ''
      const baseNum = Number(baseStr)
      if (!balanceCfg.base || baseStr === '' || !Number.isFinite(baseNum)) {
        values.balance = ''
      } else {
        let result = baseNum
        for (const h of balanceCfg.subtract || []) {
          if (!h) continue
          const termStr = normalizeMoney(src[h])
          const termNum = Number(termStr)
          if (termStr !== '' && Number.isFinite(termNum)) result -= termNum
        }
        values.balance = Number.isFinite(result) ? String(result) : ''
      }
    }

    // --- Timely Filing Deadline: optionally compute <base date> + N days -----
    if (tflCfg.mode === 'calc') {
      const baseDate = values[tflCfg.base] || ''
      values.timely_filing_deadline = baseDate
        ? addDays(baseDate, Number(tflCfg.days) || 0)
        : ''
    } else if (tflCfg.mode === 'auto') {
      // DB computes the deadline from per-payer filing rules.
      values.timely_filing_deadline = ''
    }

    const missing = REQUIRED_FIELDS.filter((k) => !values[k] || values[k] === '')
    const ok = missing.length === 0

    if (ok) {
      committable += 1
      const bal = Number(values.balance)
      if (Number.isFinite(bal)) totalBalance += bal
      const billed = Number(values.billed_amount)
      if (Number.isFinite(billed)) totalBilled += billed
      if (values.payer_name) payers.add(values.payer_name.toLowerCase())
    }

    out.push({ values, missing, ok })
  }

  return {
    rows: out,
    total: out.length,
    committable,
    skipped: out.length - committable,
    totalBalance,
    totalBilled,
    distinctPayers: payers.size,
  }
}

// The subset of normalized values we actually send to the RPC (drops helper meta).
export function toCommitRow(values) {
  const row = {}
  for (const field of TARGET_FIELDS) {
    row[field.key] = values[field.key] ?? ''
  }
  return row
}
