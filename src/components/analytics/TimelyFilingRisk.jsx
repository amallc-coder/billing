// ============================================================================
// TimelyFilingRisk — open $ leaking against timely-filing deadlines.
// Stat cards: already expired, within 30 days, within 60 days (+ beyond).
// Computed from timely_filing_deadline vs today over the OPEN universe.
// ============================================================================
import { BRAND } from '../../lib/constants'
import { money, number } from '../../lib/format'
import { timelyFilingRisk } from './compute'

function Stat({ accent, label, amount, count, hint }) {
  return (
    <div className="card" style={{ borderTop: `3px solid ${accent}` }}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ fontSize: 22, color: accent }}>
        {money(amount)}
      </div>
      <div className="kpi-sub">
        {number(count)} claims{hint ? ` · ${hint}` : ''}
      </div>
    </div>
  )
}

export default function TimelyFilingRisk({ claims }) {
  const r = timelyFilingRisk(claims)

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Timely-Filing Risk</span>
        <span className="muted">open $ vs deadline</span>
      </div>
      <div className="grid-2">
        <Stat
          accent={BRAND.bad}
          label="Already Expired"
          amount={r.expired.amount}
          count={r.expired.count}
          hint="past deadline, still open"
        />
        <Stat
          accent={BRAND.warn}
          label="Within 30 Days"
          amount={r.within30.amount}
          count={r.within30.count}
          hint="urgent"
        />
        <Stat
          accent={BRAND.cyan}
          label="Within 60 Days"
          amount={r.within60.amount}
          count={r.within60.count}
          hint="31–60 days out"
        />
        <Stat
          accent={BRAND.slate}
          label="Beyond 60 Days"
          amount={r.beyond60.amount}
          count={r.beyond60.count}
        />
      </div>
    </div>
  )
}
