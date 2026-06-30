// ============================================================================
// TopLineCards — the six COO KPI cards. Every $ is framed as pipeline /
// at-risk / recovered, never booked practice revenue.
// ============================================================================
import { moneyShort, money, number, percent } from '../../lib/format'

function Kpi({ accent, label, value, sub }) {
  return (
    <div className={`kpi kpi-accent-${accent}`}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      {sub ? <div className="kpi-sub">{sub}</div> : null}
    </div>
  )
}

export default function TopLineCards({ summary, collected }) {
  const s = summary
  const col = collected || { amount: 0, count: 0 }
  return (
    <div className="kpi-grid">
      <Kpi
        accent="navy"
        label="Total Open AR Uploaded"
        value={moneyShort(s.totalOpen)}
        sub={`pipeline at risk · ${number(s.totalOpenCount)} claims`}
      />
      <Kpi
        accent="good"
        label="Collected (in bank)"
        value={moneyShort(col.amount)}
        sub={`confirmed received — money in the bank · ${number(col.count)} claims`}
      />
      <Kpi
        accent="good"
        label="Recovered"
        value={moneyShort(s.recovered)}
        sub={`${number(s.recoveredCount)} claims · full ${money(s.recoveredFull)} / partial ${money(
          s.recoveredPartial,
        )}`}
      />
      <Kpi
        accent="bad"
        label="Left on Table"
        value={moneyShort(s.leftOnTable)}
        sub={`${number(s.leftOnTableCount)} claims · written off + timely-filing expired`}
      />
      <Kpi
        accent="cyan"
        label="Still in Play"
        value={moneyShort(s.inPlay)}
        sub={`${number(s.inPlayCount)} claims · pending biller + payer + appeals`}
      />
      <Kpi
        accent="navy"
        label="Recovery Rate"
        value={percent(s.recoveryRate)}
        sub="recovered / (recovered + left on table)"
      />
      <Kpi
        accent="warn"
        label="Expected Recoverable"
        value={moneyShort(s.expectedRecoverable)}
        sub="open AR × collection curve"
      />
    </div>
  )
}
