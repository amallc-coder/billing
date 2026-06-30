// ============================================================================
// ServiceLineBreakdown — top service lines and top CPTs by open $.
// Toggle between the two views; both over the open universe.
// ============================================================================
import { useState } from 'react'
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

export default function ServiceLineBreakdown({ claims }) {
  const [view, setView] = useState('service_line') // 'service_line' | 'cpt'

  const rows = groupOpenBy(claims, (c) => c[view]).slice(0, 10)

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Top {view === 'cpt' ? 'CPTs' : 'Service Lines'} by Open $</span>
        <div className="row" role="group" aria-label="service breakdown view">
          <button
            className="pill"
            style={toggleStyle(view === 'service_line')}
            onClick={() => setView('service_line')}
          >
            Service Line
          </button>
          <button className="pill" style={toggleStyle(view === 'cpt')} onClick={() => setView('cpt')}>
            CPT
          </button>
        </div>
      </div>

      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart
            layout="vertical"
            data={rows}
            margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
          >
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.line} horizontal={false} />
            <XAxis
              type="number"
              tick={{ fontSize: 11, fill: BRAND.slate }}
              tickFormatter={(v) => moneyShort(v)}
            />
            <YAxis
              type="category"
              dataKey="label"
              tick={{ fontSize: 11, fill: BRAND.slate }}
              width={120}
            />
            <Tooltip formatter={(v) => [money(v), 'Open $']} />
            <Bar dataKey="amount" fill={BRAND.cyan} radius={[0, 4, 4, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="data">
          <thead>
            <tr>
              <th>{view === 'cpt' ? 'CPT' : 'Service Line'}</th>
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
                  <td className={view === 'cpt' ? 'mono' : undefined}>{r.label}</td>
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

function toggleStyle(active) {
  return {
    cursor: 'pointer',
    color: active ? '#fff' : BRAND.slate,
    background: active ? BRAND.navy : 'transparent',
    borderColor: active ? BRAND.navy : BRAND.line,
    fontWeight: 600,
  }
}
