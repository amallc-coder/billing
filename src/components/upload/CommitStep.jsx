// ============================================================================
// Step 3b — Commit. Inserts the upload_batches row, calls upsert_claims with
// the committable rows, then shows a success summary + any flagged rows.
// ============================================================================
import { useState } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient'
import { Button, Spinner, Toast } from '../../components/ui/Primitives'
import { number } from '../../lib/format'
import { statusLabel } from '../../lib/constants'
import { toCommitRow } from './mapping'

export default function CommitStep({
  filename,
  mapping,
  calc,
  result,
  user,
  canEdit,
  onCommitted,
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [summary, setSummary] = useState(null) // { inserted, updated, flagged }

  const committableRows = result.rows.filter((r) => r.ok)
  const blocked = !isSupabaseConfigured || !canEdit

  const handleCommit = async () => {
    if (blocked || busy) return
    if (committableRows.length === 0) {
      setError('There are no complete rows to import.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // (a) Insert the batch row.
      const { data: batch, error: batchErr } = await supabase
        .from('upload_batches')
        .insert({
          filename,
          uploaded_by: user?.id ?? null,
          row_count: committableRows.length,
          column_mapping: { columns: mapping, calc },
        })
        .select('id')
        .single()
      if (batchErr) throw batchErr
      const batchId = batch?.id
      if (!batchId) throw new Error('Failed to create upload batch.')

      // (b) Commit the rows via the de-duping RPC.
      const payload = committableRows.map((r) => toCommitRow(r.values))
      const { data: rpcData, error: rpcErr } = await supabase.rpc('upsert_claims', {
        p_batch_id: batchId,
        p_rows: payload,
      })
      if (rpcErr) throw rpcErr

      const inserted = rpcData?.inserted ?? 0
      const updated = rpcData?.updated ?? 0
      const flagged = Array.isArray(rpcData?.flagged) ? rpcData.flagged : []
      setSummary({ inserted, updated, flagged })

      // (d) Let the parent refresh its world.
      if (typeof onCommitted === 'function') onCommitted()
    } catch (err) {
      setError(err?.message || 'Something went wrong while importing. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  // --- Already committed: success summary ---------------------------------
  if (summary) {
    return (
      <div className="section">
        <Toast tone="good">
          Import complete — {number(summary.inserted)} new claim
          {summary.inserted === 1 ? '' : 's'} added, {number(summary.updated)} updated.
        </Toast>

        <div className="kpi-grid">
          <div className="kpi kpi-accent-good">
            <span className="kpi-label">Inserted</span>
            <span className="kpi-value">{number(summary.inserted)}</span>
            <span className="kpi-sub">brand-new claims</span>
          </div>
          <div className="kpi kpi-accent-cyan">
            <span className="kpi-label">Updated</span>
            <span className="kpi-value">{number(summary.updated)}</span>
            <span className="kpi-sub">existing claims refreshed</span>
          </div>
          <div className={`kpi ${summary.flagged.length ? 'kpi-accent-warn' : ''}`}>
            <span className="kpi-label">Needs review</span>
            <span className="kpi-value">{number(summary.flagged.length)}</span>
            <span className="kpi-sub">updated but had manual status</span>
          </div>
        </div>

        {summary.flagged.length > 0 ? (
          <div className="section">
            <Toast tone="warn">
              {number(summary.flagged.length)} updated claim
              {summary.flagged.length === 1 ? ' had' : 's had'} a manually-advanced status.
              They were updated, but review them so the new data didn’t overwrite work in progress.
            </Toast>
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Claim ID</th>
                    <th>Current status</th>
                  </tr>
                </thead>
                <tbody>
                  {summary.flagged.map((f, i) => (
                    <tr key={`${f.source_claim_id}-${i}`} style={{ cursor: 'default' }}>
                      <td className="mono">{f.source_claim_id}</td>
                      <td>{statusLabel(f.current_status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>
    )
  }

  // --- Not yet committed: confirm panel -----------------------------------
  return (
    <div className="section">
      <div className="panel-title">Confirm import</div>

      {!isSupabaseConfigured ? (
        <Toast tone="bad">
          Supabase isn’t configured in this environment, so the import can’t be saved.
          Add credentials and reload to enable committing.
        </Toast>
      ) : !canEdit ? (
        <Toast tone="bad">
          Your role is read-only. You can preview an import, but you don’t have permission to commit it.
        </Toast>
      ) : (
        <div className="toast toast-info" role="status">
          <span>
            Ready to import {number(committableRows.length)} claim
            {committableRows.length === 1 ? '' : 's'} from <strong>{filename}</strong>.
            Existing claims (matched on Claim ID) will be updated; anything already worked
            past “Pending Biller” will be flagged for review rather than silently reset.
          </span>
        </div>
      )}

      {error ? (
        <Toast tone="bad" onClose={() => setError(null)}>
          {error}
        </Toast>
      ) : null}

      {busy ? (
        <Spinner label="Importing claims…" />
      ) : (
        <div className="row-wrap">
          <Button
            variant="primary"
            onClick={handleCommit}
            disabled={blocked || committableRows.length === 0}
          >
            Import {number(committableRows.length)} claim{committableRows.length === 1 ? '' : 's'}
          </Button>
          {committableRows.length === 0 ? (
            <span className="muted">No complete rows to import.</span>
          ) : null}
        </div>
      )}
    </div>
  )
}
