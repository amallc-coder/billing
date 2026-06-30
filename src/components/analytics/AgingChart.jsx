// ============================================================================
// AgingChart — open AR distributed across aging buckets, toggleable between
// dollars and claim count. Source: summarize().agingByBucket (open universe).
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
  Cell,
} from 'recharts'
import { AGING_BUCKETS, BRAND } from '../../lib/constants'
import { money, moneyShort, number } from '../../lib/format'

// Older buckets are worse — shade from cyan (fresh) toward bad (stale).
const BUCKET_COLORS = {
  '0-30': BRAND.cyan,
  '31-60': '#5aa9d6',
  '61-90': BRAND.warn,
  '91-120': '#d2691e',
  '120+': BRAND.bad,
}

export default function AgingChart({ agingByBucket }) {
  const [mode, setMode] = useState('amount') // 'amount' | 'count'

  const data = AGING_BUCKETS.map((b) => {
    const cell = agingByBucket[b] || { amount: 0, count: 0 }
    return { bucket: b, amount: cell.amount, count: cell.count }
  })

  const dataKey = mode === 'amount' ? 'amount' : 'count'

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Aging Distribution — Open AR</span>
        <div className="row" role="group" aria-label="aging metric toggle">
          <button
            className={`pill ${mode === 'amount' ? '' : 'muted'}`}
            style={toggleStyle(mode === 'amount')}
            onClick={() => setMode('amount')}
          >
            $
          </button>
          <button
            className={`pill ${mode === 'count' ? '' : 'muted'}`}
            style={toggleStyle(mode === 'count')}
            onClick={() => setMode('count')}
          >
            Count
          </button>
        </div>
      </div>

      <div style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer>
          <BarChart data={data} margin={{ top: 8, right: 12, left: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={BRAND.line} vertical={false} />
            <XAxis dataKey="bucket" tick={{ fontSize: 12, fill: BRAND.slate }} />
            <YAxis
              tick={{ fontSize: 11, fill: BRAND.slate }}
              tickFormatter={(v) => (mode === 'amount' ? moneyShort(v) : number(v))}
              width={64}
            />
            <Tooltip
              formatter={(v) => [mode === 'amount' ? money(v) : number(v), mode === 'amount' ? 'Open $' : 'Claims']}
              labelFormatter={(l) => `Aging ${l} days`}
            />
            <Bar dataKey={dataKey} radius={[4, 4, 0, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.bucket} fill={BUCKET_COLORS[d.bucket] || BRAND.navy} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="table-wrap" style={{ marginTop: 10 }}>
        <table className="data">
          <thead>
            <tr>
              <th>Bucket</th>
              <th className="num">Open $</th>
              <th className="num">Claims</th>
            </tr>
          </thead>
          <tbody>
            {data.map((d) => (
              <tr key={d.bucket}>
                <td>{d.bucket}</td>
                <td className="num">{money(d.amount)}</td>
                <td className="num">{number(d.count)}</td>
              </tr>
            ))}
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
