// ============================================================================
// KpiPanel — standard RCM KPIs as stat-lines. Denominators are stated inline
// so the COO reads them unambiguously.
// ============================================================================
import { useMemo } from 'react'
import { money, percent, number } from '../../lib/format'
import {
  denialRate,
  writeOffRate,
  appealStats,
  daysToAppeal,
  daysInAR,
} from './compute'

function StatLine({ label, value, sub }) {
  return (
    <div className="stat-line">
      <span>
        {label}
        {sub ? <span className="muted"> · {sub}</span> : null}
      </span>
      <span className="mono">{value}</span>
    </div>
  )
}

export default function KpiPanel({ claims, history, summary }) {
  const k = useMemo(() => {
    const submitDateByClaim = {}
    for (const c of claims) if (c.submit_date) submitDateByClaim[c.id] = c.submit_date

    const dr = denialRate(claims, history)
    const wo = writeOffRate(claims)
    const ap = appealStats(history)
    const dta = daysToAppeal(history, submitDateByClaim)
    const ar = daysInAR(claims)
    return { dr, wo, ap, dta, ar }
  }, [claims, history])

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Revenue-Cycle KPIs</span>
      </div>

      <StatLine
        label="Denial rate"
        value={percent(k.dr.rate)}
        sub={`${number(k.dr.denied)} ever-denied / ${number(k.dr.total)} total claims`}
      />
      <StatLine
        label="Appeal success rate"
        value={percent(k.ap.rate)}
        sub={`${number(k.ap.won)} paid / ${number(k.ap.appealed)} appealed`}
      />
      <StatLine
        label="Days to appeal"
        value={`${k.dta.avgDays.toFixed(1)} d`}
        sub={`avg submit→1st appeal · ${number(k.dta.count)} appealed`}
      />
      <StatLine label="Net revenue recovered" value={money(summary.recovered)} sub="pipeline recovered" />
      <StatLine
        label="Write-off rate"
        value={percent(k.wo.rate)}
        sub={`${number(k.wo.writtenOff)} written off / ${number(k.wo.resolved)} resolved`}
      />
      <StatLine
        label="Days in AR"
        value={`${k.ar.avg.toFixed(0)} d`}
        sub={`avg today−service · ${number(k.ar.count)} open`}
      />
      <StatLine
        label="Days in AR (balance-weighted)"
        value={`${k.ar.weighted.toFixed(0)} d`}
        sub="Σ(days×bal) / Σ(bal), open"
      />
    </div>
  )
}
