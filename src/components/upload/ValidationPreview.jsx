// ============================================================================
// Step 3a — Preview / validate. Shows normalized totals, how many rows will
// commit vs skip (missing required fields), and a preview of the first rows.
// Framed as open AR / at-risk balances being imported — never as revenue.
// ============================================================================
import { money, money0, number } from '../../lib/format'
import { payerTypeLabel } from '../../lib/constants'
import { TARGET_FIELDS } from './mapping'

const PREVIEW_LIMIT = 8

// Columns shown in the preview table (compact, most useful first).
const PREVIEW_COLS = [
  { key: 'source_claim_id', label: 'Claim ID' },
  { key: 'payer_name', label: 'Payer' },
  { key: 'payer_type', label: 'Type' },
  { key: 'service_date', label: 'DOS' },
  { key: 'balance', label: 'Balance', num: true },
  { key: 'billed_amount', label: 'Billed', num: true },
]

export default function ValidationPreview({ result }) {
  const { rows, total, committable, skipped, totalBalance, totalBilled, distinctPayers } = result
  const preview = rows.slice(0, PREVIEW_LIMIT)

  const cell = (field, key) => {
    const v = field.values[key]
    if (key === 'payer_type') return v ? payerTypeLabel(v) : '—'
    if (key === 'balance' || key === 'billed_amount') return v === '' ? '—' : money(v)
    return v === '' || v == null ? '—' : v
  }

  return (
    <div className="section">
      <div className="panel-title">Review what will be imported</div>

      <div className="kpi-grid">
        <div className="kpi kpi-accent-navy">
          <span className="kpi-label">Rows in file</span>
          <span className="kpi-value">{number(total)}</span>
          <span className="kpi-sub">parsed from your upload</span>
        </div>
        <div className="kpi kpi-accent-good">
          <span className="kpi-label">Will be imported</span>
          <span className="kpi-value">{number(committable)}</span>
          <span className="kpi-sub">all required fields present</span>
        </div>
        <div className={`kpi ${skipped > 0 ? 'kpi-accent-bad' : ''}`}>
          <span className="kpi-label">Skipped</span>
          <span className="kpi-value">{number(skipped)}</span>
          <span className="kpi-sub">missing a required field</span>
        </div>
        <div className="kpi kpi-accent-cyan">
          <span className="kpi-label">Open AR being imported</span>
          <span className="kpi-value">{money0(totalBalance)}</span>
          <span className="kpi-sub">at-risk balance across importable rows</span>
        </div>
      </div>

      <div className="grid-3">
        <div className="stat-line">
          <span className="muted">Billed amount (importable)</span>
          <span className="mono">{money0(totalBilled)}</span>
        </div>
        <div className="stat-line">
          <span className="muted">Distinct payers</span>
          <span className="mono">{number(distinctPayers)}</span>
        </div>
        <div className="stat-line">
          <span className="muted">Required fields</span>
          <span className="mono">claim · payer · balance · DOS</span>
        </div>
      </div>

      {skipped > 0 ? (
        <div className="toast toast-warn" role="status">
          <span>
            {number(skipped)} row{skipped === 1 ? '' : 's'} will be skipped because they are
            missing one or more required fields (Claim ID, Payer, Balance, or Service Date).
            Only the {number(committable)} complete row{committable === 1 ? '' : 's'} will be committed.
          </span>
        </div>
      ) : (
        <div className="toast toast-good" role="status">
          <span>Every row passed validation — all {number(committable)} will be committed.</span>
        </div>
      )}

      <div>
        <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
          Preview of the first {Math.min(PREVIEW_LIMIT, total)} normalized row
          {Math.min(PREVIEW_LIMIT, total) === 1 ? '' : 's'}:
        </div>
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 28 }} />
                {PREVIEW_COLS.map((c) => (
                  <th key={c.key} className={c.num ? 'num' : undefined}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {preview.map((field, i) => (
                <tr key={i} style={{ cursor: 'default', opacity: field.ok ? 1 : 0.55 }}>
                  <td title={field.ok ? 'Will import' : `Skipped — missing: ${field.missing.join(', ')}`}>
                    {field.ok ? '✓' : '⚠'}
                  </td>
                  {PREVIEW_COLS.map((c) => (
                    <td key={c.key} className={c.num ? 'num' : undefined}>
                      {cell(field, c.key)}
                    </td>
                  ))}
                </tr>
              ))}
              {preview.length === 0 ? (
                <tr style={{ cursor: 'default' }}>
                  <td colSpan={PREVIEW_COLS.length + 1} className="muted">
                    No rows to preview.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="muted" style={{ fontSize: 11, marginTop: 6 }}>
          Showing {Math.min(PREVIEW_LIMIT, total)} of {number(total)} rows.
          Mapped targets: {TARGET_FIELDS.filter((f) => f).length} fields.
        </div>
      </div>
    </div>
  )
}
