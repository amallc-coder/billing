// ============================================================================
// WorklistTable — the data table: sortable headers, per-row checkbox + select-
// all, and a clickable row (anywhere but the checkbox) that opens the claim.
// Balances are framed as at-risk / open AR, never booked revenue.
// ============================================================================
import {
  StatusBadge,
  ResolutionBadge,
  TierBadge,
} from '../../components/ui/Primitives'
import { money, formatDate, filingCountdown } from '../../lib/format'

// Map filingCountdown tone -> CSS var color (per spec).
const TONE_COLOR = {
  bad: 'var(--bad)',
  warn: 'var(--warn)',
  muted: 'var(--muted)',
}

// Columns: { key, label, sortable, num?, render }. `key` doubles as the sort
// column name when sortable.
const COLUMNS = [
  { key: 'source_claim_id', label: 'Claim #', sortable: true },
  { key: 'payer_name', label: 'Payer', sortable: true },
  { key: 'service_date', label: 'DOS', sortable: true },
  { key: 'aging_bucket', label: 'Aging', sortable: false },
  { key: 'balance', label: 'Balance', sortable: true, num: true },
  { key: 'status', label: 'Status', sortable: true },
  { key: 'resolution', label: 'Resolution', sortable: false },
  { key: 'assigned_to', label: 'Assigned', sortable: false },
  { key: 'next_action', label: 'Next action', sortable: false },
  { key: 'priority_score', label: 'Priority', sortable: true, num: true },
  { key: 'tier', label: 'Tier', sortable: true },
  { key: 'follow_up_date', label: 'Follow-up', sortable: true },
  { key: 'timely_filing_deadline', label: 'Timely filing', sortable: false },
]

function SortHeader({ col, sort, onSort }) {
  if (!col.sortable) {
    return <th className={col.num ? 'num' : ''}>{col.label}</th>
  }
  const active = sort.col === col.key
  const arrow = active ? (sort.ascending ? ' ▲' : ' ▼') : ''
  return (
    <th
      className={`sortable${col.num ? ' num' : ''}`}
      onClick={() => onSort(col.key)}
      title="Sort by this column"
      aria-sort={active ? (sort.ascending ? 'ascending' : 'descending') : 'none'}
    >
      {col.label}
      <span style={{ color: 'var(--cyan)' }}>{arrow}</span>
    </th>
  )
}

export default function WorklistTable({
  rows,
  sort,
  onSort,
  selected, // Set of selected ids
  onToggleRow,
  onToggleAll,
  onSelectClaim,
  nameOf,
}) {
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id))
  const someSelected = rows.some((r) => selected.has(r.id))

  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th style={{ width: 36 }}>
              <input
                type="checkbox"
                aria-label="Select all on this page"
                style={{ width: 'auto', margin: 0 }}
                checked={allSelected}
                ref={(el) => {
                  if (el) el.indeterminate = someSelected && !allSelected
                }}
                onChange={(e) => onToggleAll(e.target.checked)}
              />
            </th>
            {COLUMNS.map((col) => (
              <SortHeader key={col.key} col={col} sort={sort} onSort={onSort} />
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isSel = selected.has(row.id)
            const fc = filingCountdown(row.timely_filing_deadline)
            return (
              <tr
                key={row.id}
                className={isSel ? 'selected' : ''}
                onClick={() => onSelectClaim(row.id)}
              >
                <td onClick={(e) => e.stopPropagation()} style={{ width: 36 }}>
                  <input
                    type="checkbox"
                    aria-label={`Select claim ${row.source_claim_id}`}
                    style={{ width: 'auto', margin: 0 }}
                    checked={isSel}
                    onChange={() => onToggleRow(row.id)}
                  />
                </td>

                <td className="mono nowrap">{row.source_claim_id || '—'}</td>

                <td>
                  <div>{row.payer_name || '—'}</div>
                  {row.payer_type ? (
                    <div className="muted" style={{ fontSize: 11 }}>
                      {row.payer_type}
                    </div>
                  ) : null}
                </td>

                <td className="nowrap">{formatDate(row.service_date)}</td>

                <td className="nowrap">{row.aging_bucket || '—'}</td>

                <td className="num nowrap" title="Open AR at risk">
                  {money(row.balance)}
                </td>

                <td>
                  <StatusBadge status={row.status} />
                </td>

                <td>
                  <ResolutionBadge resolution={row.resolution} />
                </td>

                <td className="nowrap">{nameOf(row.assigned_to)}</td>

                <td
                  className="muted"
                  style={{
                    maxWidth: 200,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={row.next_action || ''}
                >
                  {row.next_action || '—'}
                </td>

                <td className="num nowrap" title="Priority score">
                  {row.priority_score ?? '—'}
                </td>

                <td>
                  <TierBadge tier={row.tier} />
                </td>

                <td className="nowrap">{formatDate(row.follow_up_date)}</td>

                <td
                  className="nowrap"
                  style={{ color: TONE_COLOR[fc.tone] || 'var(--muted)', fontWeight: 600 }}
                  title="Timely-filing deadline"
                >
                  {fc.label}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
