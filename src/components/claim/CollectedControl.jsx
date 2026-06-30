// ============================================================================
// CollectedControl — "Collected (in bank)" capability for a single claim.
//
// "Collected" is distinct from the "Payment Issued" status. Payment Issued only
// means the payer *said* they paid; "Collected (in bank)" means the money has
// actually landed and is confirmed. This is the realest money figure on the
// claim — received / confirmed in bank — as opposed to pipeline (expected) or
// at-risk (balance) figures.
//
// Drives the mark_claim_collected RPC:
//   supabase.rpc('mark_claim_collected', {
//     p_claim_id, p_collected, p_amount, p_note
//   }) -> returns the updated claim row, and writes an audit note into
//   claim_status_history (so the caller must re-load history afterwards).
//
// Permissions mirror update_claim: admins any claim; billers only claims
// assigned to them. Non-editors get a read-only note.
// ============================================================================
import { useState } from 'react'
import { supabase } from '../../lib/supabaseClient'
import { money, relativeTime } from '../../lib/format'
import { Button, Field, Spinner } from '../../components/ui/Primitives'

// Parse a free-text money input into a numeric string (RPC wants a numeric
// string or null). Returns null when blank/invalid so the DB defaults the
// amount to the current balance.
function toAmount(raw) {
  if (raw == null) return null
  const cleaned = String(raw).replace(/[$,\s]/g, '')
  if (cleaned === '') return null
  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return String(n)
}

export default function CollectedControl({ claim, editable, nameOf, onCollectedChange }) {
  // Prefill the amount input with the claim's balance (the at-risk figure we
  // most often expect to actually collect).
  const [amount, setAmount] = useState(
    claim?.balance == null ? '' : String(claim.balance),
  )
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)

  const isCollected = !!claim?.collected

  async function call(nextCollected) {
    if (!editable || busy) return
    setBusy(true)
    try {
      const { data, error } = await supabase.rpc('mark_claim_collected', {
        p_claim_id: claim.id,
        p_collected: nextCollected,
        p_amount: nextCollected ? toAmount(amount) : null,
        p_note: note.trim() || null,
      })
      if (error) {
        onCollectedChange?.(null, { tone: 'bad', msg: 'Collection update failed: ' + error.message })
        return
      }
      const updated = Array.isArray(data) ? data[0] : data
      setNote('')
      onCollectedChange?.(updated, {
        tone: 'good',
        msg: nextCollected
          ? 'Marked collected — money confirmed in bank.'
          : 'Collection cleared.',
      })
    } catch (err) {
      onCollectedChange?.(null, {
        tone: 'bad',
        msg: 'Collection update failed: ' + (err.message || String(err)),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section>
      <div className="drawer-section-title">Collected (in bank)</div>
      <div
        className="panel col"
        style={{
          gap: 12,
          borderColor: isCollected ? 'var(--good)' : undefined,
        }}
      >
        {!editable ? (
          <div className="toast toast-info" style={{ marginBottom: 2 }}>
            <span>
              Read-only — confirming money in the bank is limited to admins and the
              biller assigned to this claim.
            </span>
          </div>
        ) : null}

        {isCollected ? (
          <>
            <div className="row-wrap" style={{ gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontSize: 18, fontWeight: 750, color: 'var(--good)' }}>
                {money(claim.collected_amount)}
              </span>
              <span style={{ fontSize: 11.5, color: 'var(--muted)' }}>
                received / confirmed in bank
              </span>
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>
              Collected {money(claim.collected_amount)}
              {' · '}
              {relativeTime(claim.collected_at)}
              {claim.collected_by ? <> {' · '} by {nameOf(claim.collected_by)}</> : null}
            </div>
            <div className="row" style={{ gap: 8 }}>
              {busy ? <Spinner /> : null}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => call(false)}
                disabled={!editable || busy}
              >
                Unmark
              </Button>
            </div>
          </>
        ) : (
          <>
            <Field
              label="Amount received"
              hint="Confirmed money in the bank. Leave blank to use the current balance."
            >
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                disabled={!editable || busy}
                placeholder="0.00"
              />
            </Field>

            <Field label="Note" hint="Optional — logged in the status history.">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                disabled={!editable || busy}
                placeholder="e.g. EFT cleared, deposit confirmed."
              />
            </Field>

            <div className="row spread">
              <span className="field-hint">
                Marks this claim as collected — the realest money figure.
              </span>
              <div className="row" style={{ gap: 8 }}>
                {busy ? <Spinner /> : null}
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => call(true)}
                  disabled={!editable || busy}
                  style={{ background: 'var(--good)', borderColor: 'var(--good)' }}
                >
                  Mark collected
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </section>
  )
}
