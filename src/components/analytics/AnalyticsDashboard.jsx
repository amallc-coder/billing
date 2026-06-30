// ============================================================================
// AnalyticsDashboard — the view the COO opens first.
//
// Orchestrates: paged data load (claims + status history), a top filter bar
// (subsidiary / payer type) that narrows the claim set feeding the breakdowns,
// the six top-line cards, and every breakdown / KPI panel.
//
// Framing: the uploaded universe is UNPAID claims, so every dollar shown is
// pipeline / at-risk / recovered — never booked practice revenue.
//
// Props:
//   refreshKey (number)            — refetch when it changes
//   onSelectClaim(claimId)         — optional drill-through (safe to call)
// ============================================================================
import { useEffect, useMemo, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient'
import { summarize } from '../../lib/domain'
import { PAYER_TYPES, payerTypeLabel } from '../../lib/constants'
import { number } from '../../lib/format'
import { Spinner, EmptyState, Toast } from '../../components/ui/Primitives'
import { useRecoverySettings } from '../../hooks/useRecoverySettings'
import { useProfiles } from '../../hooks/useProfiles'

import TopLineCards from './TopLineCards'
import AgingChart from './AgingChart'
import PayerBreakdown from './PayerBreakdown'
import SubsidiaryBreakdown from './SubsidiaryBreakdown'
import ServiceLineBreakdown from './ServiceLineBreakdown'
import DenialBreakdown from './DenialBreakdown'
import TimelyFilingRisk from './TimelyFilingRisk'
import BillerProductivity from './BillerProductivity'
import KpiPanel from './KpiPanel'
import { distinctValues } from './compute'

const PAGE = 1000

const CLAIM_COLUMNS =
  'id, source_claim_id, payer_name, payer_type, subsidiary, service_line, cpt, status, ' +
  'resolution, payment_type, balance, billed_amount, expected_amount, denial_code, ' +
  'denial_remark, aging_bucket, tier, assigned_to, service_date, submit_date, ' +
  'timely_filing_deadline, created_at, updated_at, last_worked_at'

const HISTORY_COLUMNS =
  'claim_id, from_status, to_status, from_resolution, to_resolution, changed_by, changed_at'

// Page a table in chunks of PAGE rows until a short page is returned.
async function fetchAllPaged(table, columns) {
  const all = []
  let from = 0
  // Guard against runaway loops.
  for (let i = 0; i < 1000; i += 1) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .range(from, from + PAGE - 1)
    if (error) throw error
    const batch = data ?? []
    all.push(...batch)
    if (batch.length < PAGE) break
    from += PAGE
  }
  return all
}

export default function AnalyticsDashboard({ refreshKey = 0, onSelectClaim }) {
  const [claims, setClaims] = useState([])
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const { curve } = useRecoverySettings()
  const { nameOf } = useProfiles()

  // Top filter bar state — narrows the claim set feeding the breakdowns.
  const [fSubsidiary, setFSubsidiary] = useState('')
  const [fPayerType, setFPayerType] = useState('')

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setError(null)
    Promise.all([
      fetchAllPaged('claims', CLAIM_COLUMNS),
      fetchAllPaged('claim_status_history', HISTORY_COLUMNS),
    ])
      .then(([claimRows, historyRows]) => {
        if (!active) return
        setClaims(claimRows)
        setHistory(historyRows)
      })
      .catch((err) => {
        if (!active) return
        setError(err.message || 'Failed to load analytics data.')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [refreshKey])

  // Distinct subsidiaries for the filter dropdown.
  const subsidiaries = useMemo(() => distinctValues(claims, 'subsidiary'), [claims])

  // Filtered claim set feeding the breakdown panels.
  const filtered = useMemo(() => {
    if (!fSubsidiary && !fPayerType) return claims
    return claims.filter(
      (c) =>
        (!fSubsidiary || c.subsidiary === fSubsidiary) &&
        (!fPayerType || c.payer_type === fPayerType),
    )
  }, [claims, fSubsidiary, fPayerType])

  // Top-line + per-panel summaries recompute when claims/curve/filters change.
  const summaryAll = useMemo(() => summarize(claims, curve), [claims, curve])
  const summaryFiltered = useMemo(() => summarize(filtered, curve), [filtered, curve])
  const filtersActive = Boolean(fSubsidiary || fPayerType)

  // --- States ---------------------------------------------------------------
  if (!isSupabaseConfigured) {
    return (
      <div className="page">
        <Toast tone="warn">
          Supabase isn’t configured — set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to load
          analytics.
        </Toast>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="page">
        <Spinner label="Loading analytics…" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="page">
        <Toast tone="bad">{error}</Toast>
      </div>
    )
  }

  if (claims.length === 0) {
    return (
      <div className="page">
        <EmptyState
          title="No claims uploaded yet — import a file to populate analytics."
          hint="Once claims are imported, this dashboard fills with pipeline, recovery, and risk views."
        />
      </div>
    )
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Recovery Analytics</h1>
          <p className="page-sub muted">
            Pipeline at risk across {number(claims.length)} uploaded claims — every figure is
            recovery pipeline, not booked revenue.
          </p>
        </div>
      </div>

      {/* Top-line cards reflect the FULL uploaded universe. */}
      <TopLineCards summary={summaryAll} />

      {/* Filter bar — narrows the breakdowns below. */}
      <div className="toolbar">
        <label className="field">
          <span className="field-label">Subsidiary</span>
          <select value={fSubsidiary} onChange={(e) => setFSubsidiary(e.target.value)}>
            <option value="">All</option>
            {subsidiaries.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">Payer Type</span>
          <select value={fPayerType} onChange={(e) => setFPayerType(e.target.value)}>
            <option value="">All</option>
            {PAYER_TYPES.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {filtersActive && (
          <button
            className="pill"
            style={{ cursor: 'pointer', alignSelf: 'flex-end' }}
            onClick={() => {
              setFSubsidiary('')
              setFPayerType('')
            }}
          >
            Clear filters
          </button>
        )}
        {filtersActive && (
          <span className="muted" style={{ alignSelf: 'flex-end', fontSize: 12 }}>
            Showing {number(filtered.length)} of {number(claims.length)} claims
            {fSubsidiary ? ` · ${fSubsidiary}` : ''}
            {fPayerType ? ` · ${payerTypeLabel(fPayerType)}` : ''}
          </span>
        )}
      </div>

      {/* Breakdowns — driven by the filtered set. */}
      <div className="section-grid">
        <AgingChart agingByBucket={summaryFiltered.agingByBucket} />
        <PayerBreakdown claims={filtered} onSelectClaim={onSelectClaim} />
        <SubsidiaryBreakdown claims={filtered} />
        <ServiceLineBreakdown claims={filtered} />
        <DenialBreakdown claims={filtered} />
        <TimelyFilingRisk claims={filtered} />
      </div>

      <div className="section-grid">
        <KpiPanel claims={filtered} history={history} summary={summaryFiltered} />
        <BillerProductivity claims={filtered} history={history} nameOf={nameOf} />
      </div>
    </div>
  )
}
