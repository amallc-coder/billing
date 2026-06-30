// ============================================================================
// BulkActionBar — appears when ≥1 claim is selected. Three actions, each
// applied per-claim through the `update_claim` RPC (so history is logged and
// last_worked_at is stamped). "Assign to user" is admin-only.
// ============================================================================
import { useState } from 'react'
import { STATUSES } from '../../lib/constants'
import { Button } from '../../components/ui/Primitives'

export default function BulkActionBar({
  count,
  isAdmin,
  profiles,
  busy,
  onAssign, // (userId) => Promise
  onChangeStatus, // (status, note) => Promise
  onSetFollowUp, // (date) => Promise
  onClear,
}) {
  const [assignee, setAssignee] = useState('')
  const [status, setStatus] = useState('')
  const [note, setNote] = useState('')
  const [followUp, setFollowUp] = useState('')

  return (
    <div className="bulk-bar" style={{ marginBottom: 14 }}>
      <strong style={{ whiteSpace: 'nowrap' }}>
        {count} selected
      </strong>

      {/* Assign to user — admin only */}
      {isAdmin && (
        <div className="row gap-sm" style={{ gap: 6 }}>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            aria-label="Assign to user"
            disabled={busy}
          >
            <option value="">Assign to…</option>
            {profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name || p.email}
              </option>
            ))}
          </select>
          <Button
            variant="accent"
            size="sm"
            disabled={busy || !assignee}
            onClick={() => onAssign(assignee)}
          >
            Apply
          </Button>
        </div>
      )}

      {/* Change status (+ optional note) */}
      <div className="row gap-sm" style={{ gap: 6 }}>
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          aria-label="Change status"
          disabled={busy}
        >
          <option value="">Change status…</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Note (optional)"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          disabled={busy}
          style={{ width: 160 }}
        />
        <Button
          variant="accent"
          size="sm"
          disabled={busy || !status}
          onClick={() => onChangeStatus(status, note)}
        >
          Apply
        </Button>
      </div>

      {/* Set follow-up date */}
      <div className="row gap-sm" style={{ gap: 6 }}>
        <input
          type="date"
          value={followUp}
          onChange={(e) => setFollowUp(e.target.value)}
          aria-label="Set follow-up date"
          disabled={busy}
          style={{ width: 150 }}
        />
        <Button
          variant="accent"
          size="sm"
          disabled={busy || !followUp}
          onClick={() => onSetFollowUp(followUp)}
        >
          Set follow-up
        </Button>
      </div>

      <Button
        variant="ghost"
        size="sm"
        onClick={onClear}
        disabled={busy}
        style={{ marginLeft: 'auto' }}
      >
        Clear selection
      </Button>
    </div>
  )
}
