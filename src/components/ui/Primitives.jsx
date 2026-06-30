// ============================================================================
// Small shared UI primitives — badges, cards, buttons, spinner, empty states.
// Kept deliberately dependency-free and style-light (see src/index.css).
// ============================================================================
import { TIERS, STATUS_BY_VALUE, RESOLUTION_BY_VALUE } from '../../lib/constants'

export function Button({ variant = 'primary', size = 'md', as: As = 'button', className = '', ...props }) {
  return <As className={`btn btn-${variant} btn-${size} ${className}`} {...props} />
}

export function Card({ children, className = '', ...props }) {
  return (
    <div className={`card ${className}`} {...props}>
      {children}
    </div>
  )
}

export function Pill({ color, bg, children, title }) {
  return (
    <span className="pill" style={{ color, background: bg ?? 'transparent', borderColor: color }} title={title}>
      {children}
    </span>
  )
}

export function StatusBadge({ status }) {
  const s = STATUS_BY_VALUE[status]
  if (!s) return <span className="muted">—</span>
  return <Pill color={s.color} bg={`${s.color}14`} title={s.description}>{s.label}</Pill>
}

export function ResolutionBadge({ resolution }) {
  const r = RESOLUTION_BY_VALUE[resolution]
  if (!r) return <span className="muted">—</span>
  return <Pill color={r.color} bg={`${r.color}14`}>{r.label}</Pill>
}

export function TierBadge({ tier }) {
  const t = TIERS[tier]
  if (!t) return <span className="muted">—</span>
  return (
    <span className="tier-badge" style={{ color: t.color, background: t.bg, borderColor: t.color }}>
      {tier}
    </span>
  )
}

export function Spinner({ label }) {
  return (
    <div className="spinner-wrap">
      <span className="spinner" aria-hidden />
      {label ? <span className="muted">{label}</span> : null}
    </div>
  )
}

export function EmptyState({ title, hint, action }) {
  return (
    <div className="empty">
      <p className="empty-title">{title}</p>
      {hint ? <p className="muted">{hint}</p> : null}
      {action}
    </div>
  )
}

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  )
}

export function Toast({ tone = 'info', children, onClose }) {
  return (
    <div className={`toast toast-${tone}`} role="status">
      <span>{children}</span>
      {onClose ? (
        <button className="toast-close" onClick={onClose} aria-label="Dismiss">
          ×
        </button>
      ) : null}
    </div>
  )
}
