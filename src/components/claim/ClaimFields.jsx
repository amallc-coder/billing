// ============================================================================
// ClaimFields — the "Workflow" editable form + "Claim details" read-only grid.
//
// Editing rules:
//  - All controls are disabled unless `canEdit` (admin or biller).
//  - Billers may only effectively edit claims assigned to them; a biller
//    viewing a claim assigned to someone else gets a read-only form (admins
//    always edit). This is enforced via the `editable` prop computed upstream.
//  - We diff the local form against the loaded claim and emit only changed keys
//    through update_claim, plus an optional free-text note for the history.
//
// The balance shown here is pipeline revenue under recovery (at-risk), never
// booked revenue.
// ============================================================================
import { useMemo, useState } from 'react'
import {
  STATUSES,
  RESOLUTIONS,
  PAYMENT_TYPES,
} from '../../lib/constants'
import { money, formatDate, formatDateTime } from '../../lib/format'
import { Button, Field, Spinner } from '../../components/ui/Primitives'

// Keys the RPC accepts in p_patch.
const EDITABLE_KEYS = [
  'status',
  'resolution',
  'payment_type',
  'assigned_to',
  'next_action',
  'follow_up_date',
  'denial_code',
  'denial_remark',
  'expected_amount',
]

// Build the editable form-state object from a claim row. Nulls become '' so the
// inputs are controlled and clearing maps cleanly to '' for the RPC.
function formFromClaim(claim) {
  const f = {}
  for (const k of EDITABLE_KEYS) {
    const v = claim?.[k]
    f[k] = v == null ? '' : String(v)
  }
  return f
}

// A small labelled read-only cell for the details grid.
function Detail({ label, children }) {
  return (
    <div>
      <div className="field-label" style={{ marginBottom: 2 }}>{label}</div>
      <div style={{ fontSize: 13 }}>{children ?? <span className="muted">—</span>}</div>
    </div>
  )
}

function orDash(v) {
  return v === null || v === undefined || v === '' ? <span className="muted">—</span> : v
}

export default function ClaimFields({ claim, profiles, editable, saving, onSave }) {
  const initial = useMemo(() => formFromClaim(claim), [claim])
  const [form, setForm] = useState(initial)
  const [note, setNote] = useState('')

  // Reset the form whenever a different claim row loads (id change) or the row
  // is refreshed after a save.
  const [syncKey, setSyncKey] = useState(claim?.updated_at ?? claim?.id)
  const currentKey = claim?.updated_at ?? claim?.id
  if (currentKey !== syncKey) {
    setSyncKey(currentKey)
    setForm(initial)
    setNote('')
  }

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  // payment_type only meaningful when status is payment_issued.
  const showPaymentType = form.status === 'payment_issued'

  // Diff: collect only keys that differ from the loaded claim.
  const patch = useMemo(() => {
    const out = {}
    for (const k of EDITABLE_KEYS) {
      // Hide payment_type unless status is payment_issued; clear it otherwise.
      if (k === 'payment_type' && form.status !== 'payment_issued') {
        if (initial.payment_type !== '') out.payment_type = ''
        continue
      }
      if (form[k] !== initial[k]) out[k] = form[k]
    }
    return out
  }, [form, initial])

  const dirty = Object.keys(patch).length > 0 || note.trim().length > 0
  const hasFieldChanges = Object.keys(patch).length > 0

  function handleSave() {
    if (!editable || !hasFieldChanges) return
    onSave(patch, note.trim())
  }

  const disabled = !editable || saving

  return (
    <div className="col" style={{ gap: 18 }}>
      {/* ----- Workflow (editable) ----- */}
      <section>
        <div className="drawer-section-title">Workflow</div>
        <div className="panel col" style={{ gap: 12 }}>
          {!editable ? (
            <div className="toast toast-info" style={{ marginBottom: 2 }}>
              <span>
                Read-only — billers can edit only claims assigned to them. Ask an admin to
                reassign if you need to work this claim.
              </span>
            </div>
          ) : null}

          <div className="grid-2">
            <Field label="Status">
              <select value={form.status} onChange={set('status')} disabled={disabled}>
                {STATUSES.map((s) => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </Field>

            <Field label="Resolution">
              <select value={form.resolution} onChange={set('resolution')} disabled={disabled}>
                <option value="">— None —</option>
                {RESOLUTIONS.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>
            </Field>
          </div>

          {showPaymentType ? (
            <Field label="Payment type" hint="Capture whether the payer paid in full or partially.">
              <select value={form.payment_type} onChange={set('payment_type')} disabled={disabled}>
                <option value="">— Select —</option>
                {PAYMENT_TYPES.map((p) => (
                  <option key={p.value} value={p.value}>{p.label}</option>
                ))}
              </select>
            </Field>
          ) : null}

          <div className="grid-2">
            <Field label="Assigned to">
              <select value={form.assigned_to} onChange={set('assigned_to')} disabled={disabled}>
                <option value="">— Unassigned —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.full_name || p.email}</option>
                ))}
              </select>
            </Field>

            <Field label="Follow-up date">
              <input type="date" value={form.follow_up_date} onChange={set('follow_up_date')} disabled={disabled} />
            </Field>
          </div>

          <Field label="Next action">
            <textarea
              value={form.next_action}
              onChange={set('next_action')}
              disabled={disabled}
              placeholder="What's the next step to move this claim toward recovery?"
              style={{ minHeight: 52 }}
            />
          </Field>

          <div className="grid-2">
            <Field label="Denial code">
              <input value={form.denial_code} onChange={set('denial_code')} disabled={disabled} />
            </Field>
            <Field label="Expected amount" hint="Anticipated recovery (pipeline, not booked).">
              <input
                type="text"
                inputMode="decimal"
                value={form.expected_amount}
                onChange={set('expected_amount')}
                disabled={disabled}
                placeholder="0.00"
              />
            </Field>
          </div>

          <Field label="Denial remark">
            <textarea
              value={form.denial_remark}
              onChange={set('denial_remark')}
              disabled={disabled}
              style={{ minHeight: 52 }}
            />
          </Field>

          <Field label="Note for history" hint="Optional — logged alongside this change in the status history.">
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              disabled={disabled}
              placeholder="e.g. Called payer, refiling with corrected modifier."
              style={{ minHeight: 52 }}
            />
          </Field>

          <div className="row spread">
            <span className="field-hint">
              {hasFieldChanges
                ? `${Object.keys(patch).length} field${Object.keys(patch).length === 1 ? '' : 's'} changed`
                : 'No field changes'}
            </span>
            <div className="row" style={{ gap: 8 }}>
              {saving ? <Spinner /> : null}
              <Button
                variant="primary"
                size="sm"
                onClick={handleSave}
                disabled={disabled || !hasFieldChanges}
                title={note.trim() && !hasFieldChanges ? 'Add a field change to log a note' : undefined}
              >
                Save changes
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ----- Claim details (read-only) ----- */}
      <section>
        <div className="drawer-section-title">Claim details</div>
        <div className="panel grid-3" style={{ rowGap: 14 }}>
          <Detail label="Patient acct">{orDash(claim.patient_acct)}</Detail>
          <Detail label="Subsidiary">{orDash(claim.subsidiary)}</Detail>
          <Detail label="Facility">{orDash(claim.facility)}</Detail>
          <Detail label="Provider">{orDash(claim.provider)}</Detail>
          <Detail label="Date of service">{formatDate(claim.service_date)}</Detail>
          <Detail label="Submit date">{formatDate(claim.submit_date)}</Detail>
          <Detail label="CPT"><span className="mono">{orDash(claim.cpt)}</span></Detail>
          <Detail label="Service line">{orDash(claim.service_line)}</Detail>
          <Detail label="Billed amount">{money(claim.billed_amount)}</Detail>
          <Detail label="Expected (pipeline)">{claim.expected_amount == null ? <span className="muted">—</span> : money(claim.expected_amount)}</Detail>
          <Detail label="Timely-filing deadline">{formatDate(claim.timely_filing_deadline)}</Detail>
          <Detail label="Aging bucket">{orDash(claim.aging_bucket)}</Detail>
          <Detail label="Priority score">{orDash(claim.priority_score)}</Detail>
          <Detail label="Last worked">{claim.last_worked_at ? formatDateTime(claim.last_worked_at) : <span className="muted">—</span>}</Detail>
          <Detail label="Created">{formatDateTime(claim.created_at)}</Detail>
        </div>
      </section>
    </div>
  )
}
