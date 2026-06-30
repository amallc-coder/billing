// ============================================================================
// PayerBreakdown — "which payers are sitting on our money."
// Top payers by open $ (table) + payer-type split (pie). Open universe only.
// ============================================================================
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { BRAND, PAYER_TYPE_BY_VALUE, payerTypeLabel } from '../../lib/constants'
import { money, number, percent } from '../../lib/format'
import { groupOpenBy } from './compute'

const TYPE_COLORS = {
  commercial: BRAND.navy,
  medicare: BRAND.cyan,
  medicaid: '#6c5ce7',
  self_pay: BRAND.warn,
  other: BRAND.slate,
}

export default function PayerBreakdown({ claims, onSelectClaim }) {
  void onSelectClaim // drill-through reserved; payer rows aren't single claims

  const byPayer = groupOpenBy(claims, (c) => c.payer_name).slice(0, 10)
  const byType = groupOpenBy(
    claims,
    (c) => c.payer_type,
    (k) => payerTypeLabel(k),
  )
  const totalType = byType.reduce((s, r) => s + r.amount, 0)

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Payers Sitting on Our Money</span>
        <span className="muted">open $</span>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Payer</th>
                <th className="num">Open $</th>
                <th className="num">Claims</th>
              </tr>
            </thead>
            <tbody>
              {byPayer.length === 0 ? (
                <tr>
                  <td colSpan={3} className="muted">
                    No open claims
                  </td>
                </tr>
              ) : (
                byPayer.map((r) => (
                  <tr key={r.key}>
                    <td>{r.label}</td>
                    <td className="num">{money(r.amount)}</td>
                    <td className="num">{number(r.count)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div>
          <div style={{ width: '100%', height: 220 }}>
            <ResponsiveContainer>
              <PieChart>
                <Pie
                  data={byType}
                  dataKey="amount"
                  nameKey="label"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  isAnimationActive={false}
                >
                  {byType.map((r) => (
                    <Cell key={r.key} fill={TYPE_COLORS[r.key] || BRAND.slate} />
                  ))}
                </Pie>
                <Tooltip formatter={(v, n) => [money(v), n]} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="table-wrap" style={{ marginTop: 8 }}>
            <table className="data">
              <thead>
                <tr>
                  <th>Payer Type</th>
                  <th className="num">Open $</th>
                  <th className="num">Share</th>
                </tr>
              </thead>
              <tbody>
                {byType.map((r) => (
                  <tr key={r.key}>
                    <td>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 9,
                          height: 9,
                          borderRadius: 2,
                          marginRight: 6,
                          background: TYPE_COLORS[r.key] || BRAND.slate,
                        }}
                      />
                      {PAYER_TYPE_BY_VALUE[r.key]?.label ?? r.label}
                    </td>
                    <td className="num">{money(r.amount)}</td>
                    <td className="num">{percent(totalType ? r.amount / totalType : 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
