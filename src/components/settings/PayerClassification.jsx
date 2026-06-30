// ============================================================================
// PayerClassification — "Auto-classify payer types with AI".
// Reads distinct payer names from claims missing a payer_type, infers the type
// (well-known payers resolve instantly; the rest via the Claude-powered edge
// function), then writes payer_type back onto the matching claims.
// If the ANTHROPIC_API_KEY secret isn't set, unknowns default to 'other' and we
// surface a non-blocking warning.
// ============================================================================
import { useState } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient'
import { Button, Spinner, Toast, EmptyState } from '../../components/ui/Primitives'
import { number } from '../../lib/format'
import { payerTypeLabel } from '../../lib/constants'
import { classifyPayerNames } from '../../lib/payerClassify'

// Matches claims whose payer_type is NULL or an empty string.
const UNTYPED_FILTER = 'payer_type.is.null,payer_type.eq.'

export default function PayerClassification({ onMutate }) {
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null) // { tone, msg }
  const [results, setResults] = useState(null) // [{ name, type, claims }]
  const [summary, setSummary] = useState(null) // { payers, claims }

  const run = async () => {
    if (busy || !isSupabaseConfigured) return
    setBusy(true)
    setToast(null)
    setResults(null)
    setSummary(null)
    try {
      // 1) Distinct payer names that still need a type.
      const { data: rows, error: qErr } = await supabase
        .from('claims')
        .select('payer_name')
        .or(UNTYPED_FILTER)
      if (qErr) throw qErr

      const names = Array.from(
        new Set((rows ?? []).map((r) => String(r.payer_name || '').trim()).filter(Boolean)),
      )

      if (names.length === 0) {
        setToast({ tone: 'info', msg: 'Every claim already has a payer type — nothing to classify.' })
        setResults([])
        setSummary({ payers: 0, claims: 0 })
        return
      }

      // 2) Classify (deterministic guesses + AI fallback).
      const { result, aiError } = await classifyPayerNames(names)

      // 3) Apply each name → type onto the still-untyped claims.
      let claimsUpdated = 0
      const applied = []
      for (const name of names) {
        const type = result[name] || 'other'
        const { data: upd, error: uErr } = await supabase
          .from('claims')
          .update({ payer_type: type })
          .eq('payer_name', name)
          .or(UNTYPED_FILTER)
          .select('id')
        if (uErr) throw uErr
        const count = Array.isArray(upd) ? upd.length : 0
        claimsUpdated += count
        applied.push({ name, type, claims: count })
      }

      applied.sort((a, b) => b.claims - a.claims || a.name.localeCompare(b.name))
      setResults(applied)
      setSummary({ payers: applied.length, claims: claimsUpdated })

      if (aiError) {
        setToast({
          tone: 'warn',
          msg:
            'AI classification was unavailable — unknown payers defaulted to “Other”. ' +
            'Set ANTHROPIC_API_KEY as a Supabase secret to enable AI classification.',
        })
      } else {
        setToast({
          tone: 'good',
          msg: `Classified ${number(applied.length)} payer${applied.length === 1 ? '' : 's'} across ${number(
            claimsUpdated,
          )} claim${claimsUpdated === 1 ? '' : 's'}.`,
        })
      }

      if (typeof onMutate === 'function') onMutate()
    } catch (err) {
      setToast({ tone: 'bad', msg: err?.message || 'Failed to classify payers.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Payer Classification</span>
      </div>

      <p className="page-sub muted" style={{ marginTop: 0, marginBottom: 12 }}>
        Scan claims with no payer type, infer it from the payer name, and write it back. Well-known
        payers resolve instantly; the rest are inferred by the Claude-powered edge function. If the
        AI key isn&apos;t configured, unknown payers default to <strong>Other</strong>.
      </p>

      <div
        className="toast toast-info"
        role="status"
        style={{ marginBottom: 12 }}
      >
        <span>
          Tip: mapping a <strong>Payer Type</strong> column when you upload claims avoids needing
          this step.
        </span>
      </div>

      {!isSupabaseConfigured ? (
        <Toast tone="warn">Supabase isn&apos;t configured, so classification can&apos;t run.</Toast>
      ) : null}

      {toast ? (
        <div style={{ marginBottom: 12 }}>
          <Toast tone={toast.tone} onClose={() => setToast(null)}>
            {toast.msg}
          </Toast>
        </div>
      ) : null}

      {busy ? (
        <Spinner label="Classifying payers…" />
      ) : (
        <div className="row-wrap" style={{ marginBottom: results ? 14 : 0 }}>
          <Button variant="primary" onClick={run} disabled={!isSupabaseConfigured}>
            Auto-classify payer types with AI
          </Button>
        </div>
      )}

      {results && results.length > 0 ? (
        <div className="section">
          {summary ? (
            <div className="muted" style={{ fontSize: 13 }}>
              Classified {number(summary.payers)} payer{summary.payers === 1 ? '' : 's'} across{' '}
              {number(summary.claims)} claim{summary.claims === 1 ? '' : 's'}.
            </div>
          ) : null}
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>Payer name</th>
                  <th>Assigned type</th>
                  <th className="num">Claims updated</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.name} style={{ cursor: 'default' }}>
                    <td>{r.name}</td>
                    <td>{payerTypeLabel(r.type)}</td>
                    <td className="num">{number(r.claims)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : results && results.length === 0 ? (
        <EmptyState title="Nothing to classify" hint="All claims already have a payer type." />
      ) : null}
    </div>
  )
}
