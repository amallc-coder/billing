// ============================================================================
// Step 2 — Map columns. For each TARGET field, a <select> of source headers.
// Two fields get richer controls so the user can choose HOW they're determined:
//   - Open Balance: map a column, OR calculate base − (term1 + term2 + …).
//   - Timely Filing Deadline: map a column, calculate <base date> + N days,
//     or leave it to the DB (per-payer filing rule).
// ============================================================================
import { TARGET_FIELDS, requiredSatisfied, defaultCalc } from './mapping'

// A compact source-header <select>. `allowNone` adds a "— none —" option.
function HeaderSelect({ headers, value, onChange, allowNone = true, invalid = false, style }) {
  return (
    <select
      className="field"
      value={value || ''}
      onChange={(e) => onChange(e.target.value)}
      style={{
        padding: '7px 9px',
        borderColor: invalid ? 'var(--bad)' : undefined,
        ...style,
      }}
    >
      {allowNone ? <option value="">— none —</option> : null}
      {headers.map((h) => (
        <option key={h} value={h}>
          {h}
        </option>
      ))}
    </select>
  )
}

// Segmented mode toggle. options = [{ value, label }].
function ModeToggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'inline-flex', gap: 4, marginBottom: 8, flexWrap: 'wrap' }}>
      {options.map((opt) => {
        const active = value === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            className="btn btn-sm"
            onClick={() => onChange(opt.value)}
            style={{
              background: active ? 'var(--cyan)' : undefined,
              color: active ? '#fff' : undefined,
              borderColor: active ? 'var(--cyan)' : undefined,
              fontWeight: active ? 700 : 500,
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

// Friendly label for a source header in a formula hint ('' → placeholder).
function hint(h, placeholder) {
  return h || placeholder
}

// ---- Balance: column | calc -------------------------------------------------
function BalanceControl({ headers, mapping, calc, setMapping, setBalance, isMissing }) {
  const cfg = calc.balance || defaultCalc().balance
  const mode = cfg.mode || 'column'

  const setSubtractAt = (i, h) => {
    const next = [...(cfg.subtract || [])]
    next[i] = h
    setBalance({ ...cfg, subtract: next })
  }
  const addSubtract = () => setBalance({ ...cfg, subtract: [...(cfg.subtract || []), ''] })
  const removeSubtract = (i) => {
    const next = (cfg.subtract || []).filter((_, idx) => idx !== i)
    setBalance({ ...cfg, subtract: next })
  }

  const formula = `${hint(cfg.base, 'Base')}${(cfg.subtract || [])
    .map((h) => ` − ${hint(h, 'value')}`)
    .join('')}`

  return (
    <div>
      <ModeToggle
        value={mode}
        onChange={(m) => setBalance({ ...cfg, mode: m })}
        options={[
          { value: 'column', label: 'Map a column' },
          { value: 'calc', label: 'Calculate' },
        ]}
      />

      {mode === 'column' ? (
        <HeaderSelect
          headers={headers}
          value={mapping.balance || ''}
          onChange={(h) => setMapping('balance', h)}
          invalid={isMissing}
          style={{ width: '100%' }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 11, minWidth: 36 }}>
              Base
            </span>
            <HeaderSelect
              headers={headers}
              value={cfg.base || ''}
              onChange={(h) => setBalance({ ...cfg, base: h })}
              invalid={isMissing && !cfg.base}
              style={{ flex: 1, minWidth: 160 }}
            />
          </div>

          {(cfg.subtract || []).map((h, i) => (
            <div
              key={i}
              style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}
            >
              <span className="muted mono" style={{ fontSize: 13, minWidth: 36, textAlign: 'center' }}>
                −
              </span>
              <HeaderSelect
                headers={headers}
                value={h || ''}
                onChange={(val) => setSubtractAt(i, val)}
                style={{ flex: 1, minWidth: 160 }}
              />
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => removeSubtract(i)}
                aria-label="Remove subtraction"
                style={{ padding: '4px 9px' }}
              >
                ×
              </button>
            </div>
          ))}

          <div>
            <button type="button" className="btn btn-sm" onClick={addSubtract}>
              + Add subtraction
            </button>
          </div>

          <div className="muted mono" style={{ fontSize: 11 }}>
            = {formula}
          </div>
        </div>
      )}
    </div>
  )
}

// ---- Timely filing: column | calc | auto ------------------------------------
function TimelyControl({ headers, mapping, calc, setMapping, setTimely }) {
  const cfg = calc.timely_filing_deadline || defaultCalc().timely_filing_deadline
  const mode = cfg.mode || 'column'

  const baseLabel = cfg.base === 'service_date' ? 'Service Date' : 'Submit Date'

  return (
    <div>
      <ModeToggle
        value={mode}
        onChange={(m) => setTimely({ ...cfg, mode: m })}
        options={[
          { value: 'column', label: 'Map a column' },
          { value: 'calc', label: 'Calculate from date' },
          { value: 'auto', label: 'Auto (per-payer rule)' },
        ]}
      />

      {mode === 'column' ? (
        <HeaderSelect
          headers={headers}
          value={mapping.timely_filing_deadline || ''}
          onChange={(h) => setMapping('timely_filing_deadline', h)}
          style={{ width: '100%' }}
        />
      ) : mode === 'calc' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 11, minWidth: 64 }}>
              Base date
            </span>
            <select
              className="field"
              value={cfg.base || 'submit_date'}
              onChange={(e) => setTimely({ ...cfg, base: e.target.value })}
              style={{ flex: 1, minWidth: 160, padding: '7px 9px' }}
            >
              <option value="submit_date">Submit Date</option>
              <option value="service_date">Service Date / DOS</option>
            </select>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span className="muted" style={{ fontSize: 11, minWidth: 64 }}>
              Days
            </span>
            <input
              className="field"
              type="number"
              min="0"
              value={cfg.days == null ? '' : cfg.days}
              onChange={(e) => setTimely({ ...cfg, days: e.target.value })}
              style={{ width: 110, padding: '7px 9px' }}
            />
          </div>
          <div className="muted mono" style={{ fontSize: 11 }}>
            = {baseLabel} + {Number(cfg.days) || 0} days
          </div>
        </div>
      ) : (
        <div className="muted" style={{ fontSize: 12 }}>
          Computed on import from each payer's timely-filing rule.
        </div>
      )}
    </div>
  )
}

export default function ColumnMapper({ headers, mapping, onChange, calc, onCalcChange, filename }) {
  const cfg = calc || defaultCalc()
  const allRequiredOk = requiredSatisfied(mapping, cfg)

  const setMapping = (targetKey, sourceHeader) => {
    onChange({ ...mapping, [targetKey]: sourceHeader })
  }
  const setBalance = (nextBalance) => {
    onCalcChange({ ...cfg, balance: nextBalance })
  }
  const setTimely = (nextTimely) => {
    onCalcChange({ ...cfg, timely_filing_deadline: nextTimely })
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

      {!allRequiredOk ? (
        <div className="toast toast-warn" role="status">
          <span>
            Some required fields still need a column mapped (or, for Open Balance, a
            calculation set up) before you can continue.
          </span>
        </div>
      ) : (
        <div className="toast toast-good" role="status">
          <span>All required fields are set. You can continue to review.</span>
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
              // For the required Balance row, "missing" honors the calc mode.
              let isMissing
              if (field.key === 'balance') {
                const b = cfg.balance || {}
                isMissing = b.mode === 'calc' ? !b.base : !value
              } else {
                isMissing = field.required && !value
              }
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
                    {field.key === 'balance' ? (
                      <BalanceControl
                        headers={headers}
                        mapping={mapping}
                        calc={cfg}
                        setMapping={setMapping}
                        setBalance={setBalance}
                        isMissing={isMissing}
                      />
                    ) : field.key === 'timely_filing_deadline' ? (
                      <TimelyControl
                        headers={headers}
                        mapping={mapping}
                        calc={cfg}
                        setMapping={setMapping}
                        setTimely={setTimely}
                      />
                    ) : (
                      <select
                        className="field"
                        value={value}
                        onChange={(e) => setMapping(field.key, e.target.value)}
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
                    )}
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
