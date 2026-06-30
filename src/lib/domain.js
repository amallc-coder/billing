// ============================================================================
// Domain logic — claim classification & money framing.
//
// Framing rule (read the spec): the starting universe is UNPAID claims, so
// every dollar is pipeline / at-risk / recovered — never booked practice
// revenue. These helpers compute the at-risk, recovered, and leaked figures.
// ============================================================================

import {
  LEFT_ON_TABLE_RESOLUTIONS,
  IN_PLAY_STATUSES,
  IN_PLAY_RESOLUTIONS,
  DEFAULT_COLLECTION_CURVE,
  AGING_BUCKETS,
} from './constants'

const num = (v) => Number(v) || 0

// Amount originally owed on the claim (best available basis).
export function owedAmount(claim) {
  return num(claim.expected_amount) || num(claim.billed_amount) || num(claim.balance)
}

// Current open / at-risk balance.
export function atRiskAmount(claim) {
  return num(claim.balance)
}

// --- Classification ---------------------------------------------------------
export function isRecovered(claim) {
  return claim.status === 'payment_issued'
}

export function isLeftOnTable(claim) {
  return LEFT_ON_TABLE_RESOLUTIONS.includes(claim.resolution)
}

export function isInPlay(claim) {
  if (isRecovered(claim) || isLeftOnTable(claim)) return false
  return (
    IN_PLAY_STATUSES.includes(claim.status) ||
    IN_PLAY_RESOLUTIONS.includes(claim.resolution)
  )
}

// Denied & still unresolved — needs a decision (appeal / correct / write off).
export function needsDecision(claim) {
  return claim.status === 'denied' && !claim.resolution
}

// --- Money attribution ------------------------------------------------------
// Recovered $: full pay → the full owed amount; partial → owed minus the
// remaining open balance (the portion actually collected).
export function recoveredAmount(claim) {
  if (!isRecovered(claim)) return 0
  if (claim.payment_type === 'partial') {
    return Math.max(0, owedAmount(claim) - atRiskAmount(claim))
  }
  return owedAmount(claim)
}

// Money left on the table: the open balance on unrecoverable claims.
export function leftOnTableAmount(claim) {
  return isLeftOnTable(claim) ? owedAmount(claim) : 0
}

// Still-in-play $: open balance on claims being worked.
export function inPlayAmount(claim) {
  return isInPlay(claim) ? atRiskAmount(claim) : 0
}

// --- Expected recoverable (probability-weighted) ----------------------------
// Weights each open balance by the configurable collection curve.
export function collectionProbability(agingBucket, curve = DEFAULT_COLLECTION_CURVE) {
  return curve?.[agingBucket] ?? 0
}

export function expectedRecoverable(claim, curve = DEFAULT_COLLECTION_CURVE) {
  if (!isInPlay(claim) && !needsDecision(claim)) return 0
  return atRiskAmount(claim) * collectionProbability(claim.aging_bucket, curve)
}

// Convert a recovery_settings rows array into a { bucket: prob } curve.
export function curveFromSettings(rows) {
  if (!rows?.length) return { ...DEFAULT_COLLECTION_CURVE }
  return rows.reduce((acc, r) => {
    acc[r.aging_bucket] = Number(r.collection_probability)
    return acc
  }, {})
}

// --- Aggregate roll-up over a set of claims ---------------------------------
export function summarize(claims = [], curve = DEFAULT_COLLECTION_CURVE) {
  const acc = {
    totalOpen: 0,
    totalOpenCount: 0,
    recovered: 0,
    recoveredCount: 0,
    recoveredFull: 0,
    recoveredPartial: 0,
    leftOnTable: 0,
    leftOnTableCount: 0,
    inPlay: 0,
    inPlayCount: 0,
    needsDecisionCount: 0,
    expectedRecoverable: 0,
    agingByBucket: Object.fromEntries(AGING_BUCKETS.map((b) => [b, { amount: 0, count: 0 }])),
  }

  for (const c of claims) {
    const bal = atRiskAmount(c)

    if (isRecovered(c)) {
      const rec = recoveredAmount(c)
      acc.recovered += rec
      acc.recoveredCount += 1
      if (c.payment_type === 'partial') acc.recoveredPartial += rec
      else acc.recoveredFull += rec
    } else if (isLeftOnTable(c)) {
      acc.leftOnTable += leftOnTableAmount(c)
      acc.leftOnTableCount += 1
    } else {
      // open universe (in play + needs-decision)
      acc.totalOpen += bal
      acc.totalOpenCount += 1
      if (isInPlay(c)) {
        acc.inPlay += bal
        acc.inPlayCount += 1
      }
      if (needsDecision(c)) acc.needsDecisionCount += 1
      acc.expectedRecoverable += expectedRecoverable(c, curve)
      const bucket = acc.agingByBucket[c.aging_bucket]
      if (bucket) {
        bucket.amount += bal
        bucket.count += 1
      }
    }
  }

  acc.recoveryRate =
    acc.recovered + acc.leftOnTable > 0
      ? acc.recovered / (acc.recovered + acc.leftOnTable)
      : 0

  return acc
}
