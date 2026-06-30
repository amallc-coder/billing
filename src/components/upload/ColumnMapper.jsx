// ============================================================================
// Step 2 — Map columns. For each TARGET field, a <select> of source headers.
// ============================================================================
import { TARGET_FIELDS, REQUIRED_FIELDS } from './mapping'

export default function ColumnMapper({ headers, mapping, onChange, filename }) {
  const missingRequired = REQUIRED_FIELDS.filter((k) => !mapping[k])

  const setField = (targetKey, sourceHeader) => {
    onChange({ ...mapping, [targetKey]: sourceHeader })
  }

  return (
    <div className="section">
      <div className="panel-head" style={{ marginBottom: 0 }}>
        <div>
          <div className="panel-title">Map your columns</div>
          <div className="muted" style={{ fontSize: 12 }}>
            {filename ? `${filename} — ` : ''}
            {headers.length} source column{headers.length === 1 ? '' : 's'} detected.
            We pre-matched what we could; confirm or adjust below.
          </div>
        </div>
      </div>

      {missingRequired.length > 0 ? (
        <div className="toast toast-warn" role="status">
          <span>
            {missingRequired.length} required field
            {missingRequired.length === 1 ? '' : 's'} still need a column mapped before you can continue.
          </span>
        </div>
      ) : (
        <div className="toast toast-good" role="status">
          <span>All required fields are mapped. You can continue to review.</span>
        </div>
      )}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: '34%' }}>Target field</th>
              <th>Mapped source column</th>
            </tr>
          </thead>
          <tbody>
            {TARGET_FIELDS.map((field) => {
              const value = mapping[field.key] || ''
              const isMissing = field.required && !value
              return (
                <tr key={field.key} style={{ cursor: 'default' }}>
                  <td>
                    <span style={{ fontWeight: 600 }}>{field.label}</span>
                    {field.required ? (
                      <span
                        style={{
                          marginLeft: 6,
                          fontSize: 10.5,
                          fontWeight: 700,
                          color: isMissing ? 'var(--bad)' : 'var(--good)',
                          textTransform: 'uppercase',
                          letterSpacing: '0.04em',
                        }}
                      >
                        required
                      </span>
                    ) : (
                      <span className="muted" style={{ marginLeft: 6, fontSize: 11 }}>
                        optional
                      </span>
                    )}
                    <div className="muted mono" style={{ fontSize: 10.5 }}>
                      {field.key}
                    </div>
                  </td>
                  <td>
                    <select
                      className="field"
                      value={value}
                      onChange={(e) => setField(field.key, e.target.value)}
                      style={{
                        width: '100%',
                        padding: '7px 9px',
                        borderColor: isMissing ? 'var(--bad)' : undefined,
                      }}
                    >
                      <option value="">— none —</option>
                      {headers.map((h) => (
                        <option key={h} value={h}>
                          {h}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
