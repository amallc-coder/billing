// ============================================================================
// compute.js — pure helper functions for the Analytics dashboard.
// No React, no I/O. Group/sum helpers + RCM KPI calcs from status history.
//
// Framing note: every dollar here is pipeline / at-risk / recovered, never
// booked practice revenue. Classification + money attribution come from
// ../../lib/domain — these helpers only slice, group, and count.
// ============================================================================

import {
  isRecovered,
  isLeftOnTable,
  isInPlay,
  needsDecision,
  recoveredAmount,
  atRiskAmount,
  owedAmount,
} from '../../lib/domain'

const num = (v) => Number(v) || 0
const MS_PER_DAY = 86_400_000

// A claim is "open" (still in the working universe) when it is neither
// recovered nor left on the table. This matches summarize()'s open universe.
export function isOpen(claim) {
  return !isRecovered(claim) && !isLeftOnTable(claim)
}

export function openClaims(claims = []) {
  return claims.filter(isOpen)
}

// --- Generic grouping --------------------------------------------------------
// Group claims by a key, summing open balance and counting, sorted desc by $.
// `keyFn` returns the group key; `labelFn` (optional) maps key -> display label.
export function groupOpenBy(claims = [], keyFn, labelFn) {
  const map = new Map()
  for (const c of claims) {
    if (!isOpen(c)) continue
    const rawKey = keyFn(c)
    const key = rawKey == null || rawKey === '' ? '—' : rawKey
    let row = map.get(key)
    if (!row) {
      row = { key, label: labelFn ? labelFn(key) : key, amount: 0, count: 0 }
      map.set(key, row)
    }
    row.amount += atRiskAmount(c)
    row.count += 1
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount)
}

// Denial reasons (CARC) across denied claims: volume (count) + $ (open balance),
// sorted desc by count then $. Uses denial_code; falls back to '—'.
export function groupDenials(claims = []) {
  const map = new Map()
  for (const c of claims) {
    if (c.status !== 'denied') continue
    const key = c.denial_code || '—'
    let row = map.get(key)
    if (!row) {
      row = { code: key, remark: c.denial_remark || '', count: 0, amount: 0 }
      map.set(key, row)
    }
    row.count += 1
    row.amount += atRiskAmount(c)
    if (!row.remark && c.denial_remark) row.remark = c.denial_remark
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.amount - a.amount)
}

// --- Timely-filing risk ------------------------------------------------------
// Over OPEN claims with a deadline: bucket open $ by proximity to deadline.
//   expired   = deadline already passed (still open) — money leaking
//   within30  = 0..30 days to deadline
//   within60  = 31..60 days to deadline
//   beyond60  = > 60 days out (informational)
export function timelyFilingRisk(claims = [], now = new Date()) {
  const today = now instanceof Date ? now : new Date(now)
  const out = {
    expired: { amount: 0, count: 0 },
    within30: { amount: 0, count: 0 },
    within60: { amount: 0, count: 0 },
    beyond60: { amount: 0, count: 0 },
  }
  for (const c of claims) {
    if (!isOpen(c)) continue
    if (!c.timely_filing_deadline) continue
    const dl = new Date(c.timely_filing_deadline)
    if (Number.isNaN(dl.getTime())) continue
    const days = Math.ceil((dl.getTime() - today.getTime()) / MS_PER_DAY)
    const bal = atRiskAmount(c)
    let bucket
    if (days < 0) bucket = out.expired
    else if (days <= 30) bucket = out.within30
    else if (days <= 60) bucket = out.within60
    else bucket = out.beyond60
    bucket.amount += bal
    bucket.count += 1
  }
  return out
}

// --- Days in AR --------------------------------------------------------------
// Avg and balance-weighted avg of (today - service_date) over OPEN claims.
export function daysInAR(claims = [], now = new Date()) {
  const today = (now instanceof Date ? now : new Date(now)).getTime()
  let sumDays = 0
  let n = 0
  let weightedDays = 0
  let weightBal = 0
  for (const c of claims) {
    if (!isOpen(c)) continue
    if (!c.service_date) continue
    const sd = new Date(c.service_date)
    if (Number.isNaN(sd.getTime())) continue
    const days = Math.max(0, Math.floor((today - sd.getTime()) / MS_PER_DAY))
    sumDays += days
    n += 1
    const bal = atRiskAmount(c)
    weightedDays += days * bal
    weightBal += bal
  }
  return {
    avg: n ? sumDays / n : 0,
    weighted: weightBal ? weightedDays / weightBal : 0,
    count: n,
  }
}

// ============================================================================
// Status-history derived KPIs
// ============================================================================

// Filter a history array to events whose changed_at is within [from, to].
// `from`/`to` are 'YYYY-MM-DD' strings (inclusive) or falsy (no bound).
export function filterHistoryByDate(history = [], from, to) {
  if (!from && !to) return history
  const fromT = from ? new Date(`${from}T00:00:00`).getTime() : -Infinity
  const toT = to ? new Date(`${to}T23:59:59.999`).getTime() : Infinity
  return history.filter((h) => {
    const t = new Date(h.changed_at).getTime()
    return !Number.isNaN(t) && t >= fromT && t <= toT
  })
}

// Set of claim_ids that EVER hit a given to_status in history.
export function claimIdsEverStatus(history = [], status) {
  const set = new Set()
  for (const h of history) if (h.to_status === status) set.add(h.claim_id)
  return set
}

// Set of claim_ids that EVER hit a given to_resolution in history.
export function claimIdsEverResolution(history = [], resolution) {
  const set = new Set()
  for (const h of history) if (h.to_resolution === resolution) set.add(h.claim_id)
  return set
}

// --- Appeal KPIs -------------------------------------------------------------
// Appeal success = of claims that filed an appeal, how many later reached
// payment_issued (the appeal event must precede the payment event in time).
export function appealStats(history = []) {
  // Build per-claim ordered timeline of relevant events.
  const byClaim = new Map()
  for (const h of history) {
    let arr = byClaim.get(h.claim_id)
    if (!arr) {
      arr = []
      byClaim.set(h.claim_id, arr)
    }
    arr.push(h)
  }
  let appealed = 0
  let won = 0
  for (const [, events] of byClaim) {
    events.sort((a, b) => new Date(a.changed_at) - new Date(b.changed_at))
    let firstAppealAt = null
    for (const e of events) {
      if (e.to_resolution === 'appeal_filed' && firstAppealAt == null) {
        firstAppealAt = new Date(e.changed_at).getTime()
      }
    }
    if (firstAppealAt == null) continue
    appealed += 1
    const paidAfter = events.some(
      (e) =>
        e.to_status === 'payment_issued' &&
        new Date(e.changed_at).getTime() >= firstAppealAt,
    )
    if (paidAfter) won += 1
  }
  return { appealed, won, rate: appealed ? won / appealed : 0 }
}

// Days-to-appeal = avg days from claim.submit_date to its FIRST appeal_filed
// event. `submitDateByClaim` maps claim_id -> submit_date.
export function daysToAppeal(history = [], submitDateByClaim = {}) {
  const firstAppeal = new Map()
  for (const h of history) {
    if (h.to_resolution !== 'appeal_filed') continue
    const t = new Date(h.changed_at).getTime()
    if (Number.isNaN(t)) continue
    const prev = firstAppeal.get(h.claim_id)
    if (prev == null || t < prev) firstAppeal.set(h.claim_id, t)
  }
  let sum = 0
  let n = 0
  for (const [claimId, appealT] of firstAppeal) {
    const sd = submitDateByClaim[claimId]
    if (!sd) continue
    const subT = new Date(sd).getTime()
    if (Number.isNaN(subT)) continue
    const days = (appealT - subT) / MS_PER_DAY
    if (days < 0) continue
    sum += days
    n += 1
  }
  return { avgDays: n ? sum / n : 0, count: n }
}

// --- Denial / write-off rates ------------------------------------------------
// Denial rate over the claim set: claims that are currently denied OR ever hit
// 'denied' in history, divided by total claims. Returns numerator/denominator
// so the caller can label the denominator.
export function denialRate(claims = [], history = []) {
  const everDenied = claimIdsEverStatus(history, 'denied')
  let denied = 0
  for (const c of claims) {
    if (c.status === 'denied' || everDenied.has(c.id)) denied += 1
  }
  const total = claims.length
  return { denied, total, rate: total ? denied / total : 0 }
}

// Write-off rate = written_off count / total RESOLVED. "Resolved" = recovered
// (payment_issued) or left on table (written_off / timely_filing_expired).
export function writeOffRate(claims = []) {
  let writtenOff = 0
  let resolved = 0
  for (const c of claims) {
    const recovered = isRecovered(c)
    const left = isLeftOnTable(c)
    if (recovered || left) resolved += 1
    if (c.resolution === 'written_off') writtenOff += 1
  }
  return { writtenOff, resolved, total: claims.length, rate: resolved ? writtenOff / resolved : 0 }
}

// --- Biller productivity -----------------------------------------------------
// Per user, combining status history (activity) and claims (recovered $).
//   - statusChanges: # history events with changed_by = user (in range)
//   - claimsWorked: distinct claim_ids the user changed (in range)
//   - recovered$: sum recoveredAmount over claims where assigned_to = user and
//     the claim is recovered (NOT range-filtered — current state attribution)
// Returns rows for every user appearing as changed_by OR assigned_to.
export function billerProductivity(claims = [], history = []) {
  const rows = new Map()
  const ensure = (id) => {
    let r = rows.get(id)
    if (!r) {
      r = { userId: id, statusChanges: 0, worked: new Set(), recovered: 0, recoveredCount: 0 }
      rows.set(id, r)
    }
    return r
  }

  for (const h of history) {
    if (!h.changed_by) continue
    const r = ensure(h.changed_by)
    r.statusChanges += 1
    if (h.claim_id) r.worked.add(h.claim_id)
  }

  for (const c of claims) {
    if (!c.assigned_to) continue
    if (isRecovered(c)) {
      const r = ensure(c.assigned_to)
      r.recovered += recoveredAmount(c)
      r.recoveredCount += 1
    }
  }

  return [...rows.values()]
    .map((r) => ({
      userId: r.userId,
      statusChanges: r.statusChanges,
      claimsWorked: r.worked.size,
      recovered: r.recovered,
      recoveredCount: r.recoveredCount,
    }))
    .sort((a, b) => b.recovered - a.recovered || b.statusChanges - a.statusChanges)
}

// --- Collected (in bank) -----------------------------------------------------
// "Collected" = cash actually confirmed received, flagged on the claim via the
// `collected` boolean + `collected_amount` numeric. This is the realest figure
// (money in the bank), distinct from Recovered (payer-issued). Simple filter+sum.
export function collectedSummary(claims = []) {
  let amount = 0
  let count = 0
  for (const c of claims) {
    if (!c.collected) continue
    amount += num(c.collected_amount)
    count += 1
  }
  return { amount, count }
}

// Distinct values of a field across claims (for filter dropdowns), sorted.
export function distinctValues(claims = [], field) {
  const set = new Set()
  for (const c of claims) {
    const v = c[field]
    if (v != null && v !== '') set.add(v)
  }
  return [...set].sort()
}

export { num, owedAmount }
