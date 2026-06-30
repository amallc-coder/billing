// ============================================================================
// SubsidiaryBreakdown — open $ and counts per subsidiary (AMMO/AMAZ/AMGA/…).
// ============================================================================
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from 'recharts'
import { BRAND } from '../../lib/constants'
import { money, moneyShort, number } from '../../lib/format'
import { groupOpenBy } from './compute'

export default function SubsidiaryBreakdown({ claims }) {
  const rows = groupOpenBy(claims, (c) => c.subsidiary)

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Open AR by Subsidiary</span>
        <span className="muted">open $</span>
      </div>

      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={rows} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.line} vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 12, fill: BRAND.slate }} />
            <YAxis
              tick={{ fontSize: 11, fill: BRAND.slate }}
              tickFormatter={(v) => moneyShort(v)}
              width={64}
            />
            <Tooltip formatter={(v) => [money(v), 'Open $']} />
            <Bar dataKey="amount" fill={BRAND.navy} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Subsidiary</th>
              <th className="num">Open $</th>
              <th className="num">Claims</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="muted">
                  No open claims
                </td>
              </tr>
            ) : (
              rows.map((r) => (
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
    </div>
  )
}
