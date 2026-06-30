// ============================================================================
// StatusTimeline — renders claim_status_history as a vertical timeline.
// Each entry shows the status and/or resolution transition, the actor, the
// timestamp, and an optional note. Pure presentational; data is fetched by the
// orchestrator and passed in.
// ============================================================================
import { statusLabel, resolutionLabel } from '../../lib/constants'
import { formatDateTime, relativeTime } from '../../lib/format'
import { EmptyState } from '../../components/ui/Primitives'

// "From → To" line, only rendered when the pair actually changed.
function Transition({ label, from, to, render }) {
  if (from == null && to == null) return null
  if (from === to) return null
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'baseline', flexWrap: 'wrap' }}>
      <span className="muted" style={{ fontSize: 11.5, fontWeight: 700 }}>{label}</span>
      <span>{from ? render(from) : <span className="muted">—</span>}</span>
      <span className="muted">→</span>
      <span>{to ? render(to) : <span className="muted">—</span>}</span>
    </div>
  )
}

export default function StatusTimeline({ history, nameOf }) {
  if (!history || history.length === 0) {
    return <EmptyState title="No history yet" hint="Status and resolution changes will appear here." />
  }

  return (
    <div className="timeline">
      {history.map((h) => {
        const statusChanged = h.from_status !== h.to_status
        const resolutionChanged = h.from_resolution !== h.to_resolution
        return (
          <div className="timeline-item" key={h.id}>
            <span className="timeline-dot" />
            <span className="timeline-line" />
            <div className="timeline-body" style={{ flex: 1 }}>
              {statusChanged ? (
                <Transition
                  label="Status"
                  from={h.from_status}
                  to={h.to_status}
                  render={(v) => statusLabel(v)}
                />
              ) : null}
              {resolutionChanged ? (
                <Transition
                  label="Resolution"
                  from={h.from_resolution}
                  to={h.to_resolution}
                  render={(v) => resolutionLabel(v)}
                />
              ) : null}
              {!statusChanged && !resolutionChanged ? (
                <div className="muted" style={{ fontSize: 12 }}>Updated</div>
              ) : null}
              {h.note ? (
                <div style={{ marginTop: 4, whiteSpace: 'pre-wrap' }}>{h.note}</div>
              ) : null}
              <div className="timeline-meta" style={{ marginTop: 3 }}>
                {nameOf(h.changed_by)} · {formatDateTime(h.changed_at)} · {relativeTime(h.changed_at)}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
