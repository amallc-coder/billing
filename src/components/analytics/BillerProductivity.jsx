// ============================================================================
// BillerProductivity — per user: claims worked, status changes, recovered $.
// Activity columns (worked / changes) honor a changed_at date-range filter;
// recovered $ reflects current assigned_to attribution (not range-filtered).
// ============================================================================
import { useMemo, useState } from 'react'
import { money, number } from '../../lib/format'
import { billerProductivity, filterHistoryByDate } from './compute'

export default function BillerProductivity({ claims, history, nameOf }) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')

  const rows = useMemo(() => {
    const scoped = filterHistoryByDate(history, from, to)
    return billerProductivity(claims, scoped)
  }, [claims, history, from, to])

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Biller Productivity</span>
        <div className="filter-row">
          <label className="field">
            <span className="field-label">From</span>
            <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} />
          </label>
          <label className="field">
            <span className="field-label">To</span>
            <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} />
          </label>
          {(from || to) && (
            <button
              className="pill"
              style={{ cursor: 'pointer', alignSelf: 'flex-end' }}
              onClick={() => {
                setFrom('')
                setTo('')
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <p className="muted" style={{ fontSize: 11.5, marginBottom: 8 }}>
        Claims worked &amp; status changes filtered by activity date range. Recovered $ attributed
        to current assignee on recovered claims.
      </p>

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>Biller</th>
              <th className="num">Claims Worked</th>
              <th className="num">Status Changes</th>
              <th className="num">Recovered $</th>
              <th className="num">Recovered Claims</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="muted">
                  No activity in range
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.userId}>
                  <td>{nameOf(r.userId)}</td>
                  <td className="num">{number(r.claimsWorked)}</td>
                  <td className="num">{number(r.statusChanges)}</td>
                  <td className="num">{money(r.recovered)}</td>
                  <td className="num">{number(r.recoveredCount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
