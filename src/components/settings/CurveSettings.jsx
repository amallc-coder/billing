// ============================================================================
// CurveSettings — edit the collection-probability curve (recovery_settings),
// one probability [0..1] per aging bucket. This drives "Expected recoverable"
// in analytics. Saving persists each bucket and notifies via onMutate().
// ============================================================================
import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient'
import { Button, Spinner, Toast } from '../../components/ui/Primitives'
import { percent } from '../../lib/format'
import { AGING_BUCKETS, DEFAULT_COLLECTION_CURVE } from '../../lib/constants'

const labelStyle = {
  fontSize: 11.5,
  fontWeight: 650,
  color: 'var(--slate)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
const hintStyle = { fontSize: 11.5, color: 'var(--muted)' }

// Clamp a free-typed value to a sane probability for display/persisting.
function clampProb(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return 0
  if (n < 0) return 0
  if (n > 1) return 1
  return n
}

export default function CurveSettings({ onMutate }) {
  // form maps aging_bucket -> string value (so the input is freely editable)
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null)

  useEffect(() => {
    let active = true
    if (!isSupabaseConfigured) {
      setForm(Object.fromEntries(AGING_BUCKETS.map((b) => [b, String(DEFAULT_COLLECTION_CURVE[b] ?? 0)])))
      setLoading(false)
      return () => {}
    }
    supabase
      .from('recovery_settings')
      .select('aging_bucket, collection_probability, sort_order')
      .order('sort_order', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return
        if (error) setToast({ tone: 'bad', msg: error.message || 'Failed to load curve.' })
        const byBucket = Object.fromEntries((data ?? []).map((r) => [r.aging_bucket, r.collection_probability]))
        const next = Object.fromEntries(
          AGING_BUCKETS.map((b) => {
            const v = byBucket[b]
            return [b, String(v != null ? v : DEFAULT_COLLECTION_CURVE[b] ?? 0)]
          }),
        )
        setForm(next)
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const set = (bucket) => (val) => setForm((f) => ({ ...f, [bucket]: val }))

  const save = async () => {
    if (busy || !isSupabaseConfigured) return
    setBusy(true)
    setToast(null)
    try {
      // Persist each bucket. Upsert so a missing row is created rather than no-op.
      const rows = AGING_BUCKETS.map((b, i) => ({
        aging_bucket: b,
        collection_probability: clampProb(form?.[b]),
        sort_order: i,
      }))
      for (const r of rows) {
        const { error } = await supabase
          .from('recovery_settings')
          .upsert(
            { aging_bucket: r.aging_bucket, collection_probability: r.collection_probability },
            { onConflict: 'aging_bucket' },
          )
        if (error) throw error
      }
      setToast({ tone: 'good', msg: 'Collection curve saved.' })
      if (typeof onMutate === 'function') onMutate()
    } catch (err) {
      setToast({ tone: 'bad', msg: err?.message || 'Failed to save the curve.' })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Spinner label="Loading collection curve…" />

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Collection Probability Curve</span>
      </div>

      <p className="page-sub muted" style={{ marginTop: 0, marginBottom: 14 }}>
        Expected share of an open balance you&apos;ll collect, by aging bucket (0–1). This drives
        <strong> Expected recoverable</strong> across analytics.
      </p>

      {!isSupabaseConfigured ? (
        <Toast tone="warn">Supabase isn&apos;t configured, so changes can&apos;t be saved.</Toast>
      ) : null}

      {toast ? (
        <div style={{ marginBottom: 12 }}>
          <Toast tone={toast.tone} onClose={() => setToast(null)}>
            {toast.msg}
          </Toast>
        </div>
      ) : null}

      <div className="grid-3" style={{ marginBottom: 18 }}>
        {AGING_BUCKETS.map((b) => {
          const id = `curve-${b}`
          const pct = percent(clampProb(form?.[b]), 0)
          return (
            <label key={b} className="field" htmlFor={id}>
              <span style={labelStyle}>{b} days</span>
              <input
                id={id}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                max="1"
                value={form?.[b] ?? ''}
                onChange={(e) => set(b)(e.target.value)}
              />
              <span style={hintStyle}>≈ {pct} collected</span>
            </label>
          )
        })}
      </div>

      {busy ? (
        <Spinner label="Saving…" />
      ) : (
        <div className="row-wrap">
          <Button variant="primary" onClick={save} disabled={!isSupabaseConfigured}>
            Save curve
          </Button>
        </div>
      )}
    </div>
  )
}
