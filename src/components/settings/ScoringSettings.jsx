// ============================================================================
// ScoringSettings — edit the single scoring_settings row (id=1) that drives
// claim priority scoring and A/B/C tiering. "Save" persists the weights;
// "Save & recompute scores" also re-runs recompute_claim_scores() so existing
// claims pick up the new weights immediately.
// ============================================================================
import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient'
import { Button, Spinner, Toast } from '../../components/ui/Primitives'
import { number } from '../../lib/format'

// All numeric columns on scoring_settings, grouped for the form layout.
const AGING_FIELDS = [
  { key: 'aging_pts_0_30', label: '0–30 days' },
  { key: 'aging_pts_31_60', label: '31–60 days' },
  { key: 'aging_pts_61_90', label: '61–90 days' },
  { key: 'aging_pts_91_120', label: '91–120 days' },
  { key: 'aging_pts_120_plus', label: '120+ days' },
]

// Fields that store integer "days" — rendered with step=1.
const INT_FIELDS = new Set([
  'tier_a_aging_days',
  'tier_a_deadline_days',
  'tier_b_aging_days',
  'tier_c_aging_days',
])

const ALL_KEYS = [
  ...AGING_FIELDS.map((f) => f.key),
  'balance_per_dollar',
  'balance_pts_cap',
  'deadline_within_30_pts',
  'deadline_within_60_pts',
  'tier_a_aging_days',
  'tier_a_balance',
  'tier_a_deadline_days',
  'tier_b_aging_days',
  'tier_c_aging_days',
]

const labelStyle = {
  fontSize: 11.5,
  fontWeight: 650,
  color: 'var(--slate)',
  textTransform: 'uppercase',
  letterSpacing: '0.04em',
}
const hintStyle = { fontSize: 11.5, color: 'var(--muted)' }
const groupTitleStyle = { fontSize: 13, fontWeight: 700, marginBottom: 2 }

function NumberInput({ id, value, onChange, step = 'any', min }) {
  return (
    <input
      id={id}
      type="number"
      inputMode="decimal"
      step={step}
      min={min}
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    />
  )
}

function FieldRow({ id, label, hint, children }) {
  return (
    <label className="field" htmlFor={id}>
      <span style={labelStyle}>{label}</span>
      {children}
      {hint ? <span style={hintStyle}>{hint}</span> : null}
    </label>
  )
}

export default function ScoringSettings({ onMutate }) {
  const [form, setForm] = useState(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [toast, setToast] = useState(null) // { tone, msg }

  useEffect(() => {
    let active = true
    if (!isSupabaseConfigured) {
      setLoading(false)
      return () => {}
    }
    supabase
      .from('scoring_settings')
      .select('*')
      .eq('id', 1)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setToast({ tone: 'bad', msg: error.message || 'Failed to load scoring settings.' })
        setForm(data ?? {})
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const set = (key) => (val) => setForm((f) => ({ ...f, [key]: val }))

  // Build the numeric payload, coercing every field to a Number (blank → 0).
  const buildPayload = () => {
    const out = {}
    for (const k of ALL_KEYS) {
      const raw = form?.[k]
      const num = raw === '' || raw == null ? 0 : Number(raw)
      out[k] = Number.isFinite(num) ? num : 0
    }
    return out
  }

  const save = async (recompute) => {
    if (busy || !isSupabaseConfigured) return
    setBusy(true)
    setToast(null)
    try {
      const payload = buildPayload()
      const { error: updErr } = await supabase
        .from('scoring_settings')
        .update(payload)
        .eq('id', 1)
      if (updErr) throw updErr

      if (recompute) {
        const { data: rescored, error: rpcErr } = await supabase.rpc('recompute_claim_scores')
        if (rpcErr) throw rpcErr
        const n = Number(rescored) || 0
        setToast({ tone: 'good', msg: `Saved. ${number(n)} claim${n === 1 ? '' : 's'} rescored.` })
        if (typeof onMutate === 'function') onMutate()
      } else {
        setToast({ tone: 'good', msg: 'Scoring weights saved.' })
      }
    } catch (err) {
      setToast({ tone: 'bad', msg: err?.message || 'Failed to save scoring settings.' })
    } finally {
      setBusy(false)
    }
  }

  if (loading) return <Spinner label="Loading scoring settings…" />

  return (
    <div className="panel">
      <div className="panel-head">
        <span className="panel-title">Scoring &amp; Tiering</span>
      </div>

      <p className="page-sub muted" style={{ marginTop: 0, marginBottom: 14 }}>
        These weights drive each claim&apos;s priority score and A/B/C tier. Changes apply to a
        claim the next time it&apos;s touched (status change, edit, re-upload) — use
        <strong> Save &amp; recompute scores</strong> to re-rank every existing claim now.
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

      {/* Aging points */}
      <div className="section" style={{ marginBottom: 18 }}>
        <div style={groupTitleStyle}>Aging points</div>
        <div style={hintStyle}>Points awarded by how long the claim has been aging.</div>
        <div className="grid-3">
          {AGING_FIELDS.map((f) => (
            <FieldRow key={f.key} id={`sc-${f.key}`} label={f.label}>
              <NumberInput id={`sc-${f.key}`} value={form?.[f.key]} onChange={set(f.key)} />
            </FieldRow>
          ))}
        </div>
      </div>

      {/* Balance */}
      <div className="section" style={{ marginBottom: 18 }}>
        <div style={groupTitleStyle}>Balance</div>
        <div className="grid-2">
          <FieldRow
            id="sc-balance_per_dollar"
            label="Points per $1"
            hint="0.01 = 1 point per $100"
          >
            <NumberInput
              id="sc-balance_per_dollar"
              value={form?.balance_per_dollar}
              onChange={set('balance_per_dollar')}
            />
          </FieldRow>
          <FieldRow id="sc-balance_pts_cap" label="Balance points cap" hint="Max points from balance.">
            <NumberInput
              id="sc-balance_pts_cap"
              value={form?.balance_pts_cap}
              onChange={set('balance_pts_cap')}
            />
          </FieldRow>
        </div>
      </div>

      {/* Timely-filing urgency */}
      <div className="section" style={{ marginBottom: 18 }}>
        <div style={groupTitleStyle}>Timely-filing urgency</div>
        <div style={hintStyle}>Extra points as the filing deadline approaches.</div>
        <div className="grid-2">
          <FieldRow id="sc-deadline_within_30_pts" label="Within 30 days">
            <NumberInput
              id="sc-deadline_within_30_pts"
              value={form?.deadline_within_30_pts}
              onChange={set('deadline_within_30_pts')}
            />
          </FieldRow>
          <FieldRow id="sc-deadline_within_60_pts" label="Within 60 days">
            <NumberInput
              id="sc-deadline_within_60_pts"
              value={form?.deadline_within_60_pts}
              onChange={set('deadline_within_60_pts')}
            />
          </FieldRow>
        </div>
      </div>

      {/* Tier thresholds */}
      <div className="section" style={{ marginBottom: 18 }}>
        <div style={groupTitleStyle}>Tier thresholds</div>
        <div style={hintStyle}>
          A claim lands in the highest tier whose thresholds it meets (A is most urgent).
        </div>
        <div style={{ ...groupTitleStyle, fontSize: 12, color: 'var(--slate)', marginTop: 8 }}>
          Tier A · Urgent
        </div>
        <div className="grid-3">
          <FieldRow id="sc-tier_a_aging_days" label="Aging days ≥">
            <NumberInput
              id="sc-tier_a_aging_days"
              value={form?.tier_a_aging_days}
              onChange={set('tier_a_aging_days')}
              step={1}
            />
          </FieldRow>
          <FieldRow id="sc-tier_a_balance" label="Balance $ ≥">
            <NumberInput
              id="sc-tier_a_balance"
              value={form?.tier_a_balance}
              onChange={set('tier_a_balance')}
            />
          </FieldRow>
          <FieldRow id="sc-tier_a_deadline_days" label="Deadline within (days)">
            <NumberInput
              id="sc-tier_a_deadline_days"
              value={form?.tier_a_deadline_days}
              onChange={set('tier_a_deadline_days')}
              step={1}
            />
          </FieldRow>
        </div>
        <div className="grid-2" style={{ marginTop: 10 }}>
          <FieldRow id="sc-tier_b_aging_days" label="Tier B · aging days ≥">
            <NumberInput
              id="sc-tier_b_aging_days"
              value={form?.tier_b_aging_days}
              onChange={set('tier_b_aging_days')}
              step={1}
            />
          </FieldRow>
          <FieldRow id="sc-tier_c_aging_days" label="Tier C · aging days ≥">
            <NumberInput
              id="sc-tier_c_aging_days"
              value={form?.tier_c_aging_days}
              onChange={set('tier_c_aging_days')}
              step={1}
            />
          </FieldRow>
        </div>
      </div>

      {busy ? (
        <Spinner label="Saving…" />
      ) : (
        <div className="row-wrap">
          <Button variant="secondary" onClick={() => save(false)} disabled={!isSupabaseConfigured}>
            Save
          </Button>
          <Button variant="primary" onClick={() => save(true)} disabled={!isSupabaseConfigured}>
            Save &amp; recompute scores
          </Button>
        </div>
      )}
    </div>
  )
}
