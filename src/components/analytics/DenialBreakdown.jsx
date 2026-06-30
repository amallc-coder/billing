// ============================================================================
// DenialBreakdown — denial reasons by CARC (denial_code): volume + open $,
// sorted desc by volume. Bar chart (count) paired with a $-bearing table.
// Scope: currently-denied claims.
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
import { money, number } from '../../lib/format'
import { groupDenials } from './compute'

export default function DenialBreakdown({ claims }) {
  const rows = groupDenials(claims)
  const top = rows.slice(0, 10)

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Denial Reasons by CARC</span>
        <span className="muted">denied claims</span>
      </div>

      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart layout="vertical" data={top} margin={{ top: 4, right: 16, left: 8, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.line} horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 11, fill: BRAND.slate }} allowDecimals={false} />
            <YAxis
              type="category"
              dataKey="code"
              tick={{ fontSize: 11, fill: BRAND.slate }}
              width={70}
            />
            <Tooltip formatter={(v) => [number(v), 'Denials']} />
            <Bar dataKey="count" fill={BRAND.bad} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="data">
          <thead>
            <tr>
              <th>CARC</th>
              <th>Remark</th>
              <th className="num">Volume</th>
              <th className="num">Open $</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={4} className="muted">
                  No denied claims
                </td>
              </tr>
            ) : (
              rows.slice(0, 15).map((r) => (
                <tr key={r.code}>
                  <td className="mono">{r.code}</td>
                  <td className="muted" style={{ maxWidth: 240 }}>
                    {r.remark || '—'}
                  </td>
                  <td className="num">{number(r.count)}</td>
                  <td className="num">{money(r.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
