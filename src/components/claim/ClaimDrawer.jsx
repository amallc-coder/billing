// ============================================================================
// ClaimDrawer — right-side drawer for working a single unpaid claim.
//
// Responsibilities (orchestrator):
//  - Load the full claim row + its status history.
//  - Own the update_claim RPC; on success refresh local state + history and
//    bubble onMutate() so the worklist/KPIs refresh.
//  - Compose the editable Workflow form (ClaimFields), the status timeline
//    (StatusTimeline), and the realtime comment thread (CommentThread).
//
// Permission model: admins edit anything; billers edit only claims assigned to
// them; everyone else (viewers) is read-only. The balance is framed throughout
// as at-risk pipeline revenue under recovery — never booked revenue.
// ============================================================================
import { useCallback, useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient'
import { money, filingCountdown } from '../../lib/format'
import {
  Spinner,
  EmptyState,
  Toast,
  StatusBadge,
  ResolutionBadge,
  TierBadge,
} from '../../components/ui/Primitives'
import { useAuth } from '../../context/AuthContext'
import { useProfiles } from '../../hooks/useProfiles'
import ClaimFields from './ClaimFields'
import StatusTimeline from './StatusTimeline'
import CommentThread from './CommentThread'
import CollectedControl from './CollectedControl'

const CLAIM_COLUMNS = `
  id, source_claim_id, patient_acct, payer_name, payer_type, subsidiary, facility,
  provider, service_date, submit_date, cpt, service_line, billed_amount, expected_amount,
  balance, denial_code, denial_remark, timely_filing_deadline, status, resolution,
  payment_type, assigned_to, next_action, follow_up_date, priority_score, aging_bucket,
  tier, last_worked_at, created_at, updated_at,
  collected, collected_amount, collected_at, collected_by
`

const TONE_COLOR = { bad: 'var(--bad)', warn: 'var(--warn)', muted: 'var(--muted)', good: 'var(--good)' }

export default function ClaimDrawer({ claimId, onClose, onMutate }) {
  const { user, isAdmin, isBiller, canEdit } = useAuth()
  const { profiles, byId, nameOf } = useProfiles()

  const [claim, setClaim] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [saving, setSaving] = useState(false)
  const [toast, setToast] = useState(null) // { tone, msg }

  const loadHistory = useCallback(async () => {
    const { data } = await supabase
      .from('claim_status_history')
      .select('id, claim_id, from_status, to_status, from_resolution, to_resolution, changed_by, note, changed_at')
      .eq('claim_id', claimId)
      .order('changed_at', { ascending: false })
    setHistory(data ?? [])
  }, [claimId])

  // Load claim + history whenever the claim id changes.
  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    let active = true
    setLoading(true)
    setNotFound(false)
    setClaim(null)
    setHistory([])

    ;(async () => {
      const { data, error } = await supabase
        .from('claims')
        .select(CLAIM_COLUMNS)
        .eq('id', claimId)
        .maybeSingle()
      if (!active) return
      if (error) {
        setToast({ tone: 'bad', msg: error.message })
        setNotFound(true)
      } else if (!data) {
        setNotFound(true)
      } else {
        setClaim(data)
        await loadHistory()
      }
      if (active) setLoading(false)
    })()

    return () => {
      active = false
    }
  }, [claimId, loadHistory])

  // Close on Escape.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // Whether the current user may actually edit this claim.
  const editable =
    canEdit && (isAdmin || (isBiller && claim?.assigned_to === user?.id))

  async function handleSave(patch, note) {
    if (!editable) return
    setSaving(true)
    setToast(null)
    try {
      const { data, error } = await supabase.rpc('update_claim', {
        p_claim_id: claimId,
        p_patch: patch,
        p_note: note || null,
      })
      if (error) {
        setToast({ tone: 'bad', msg: 'Save failed: ' + error.message })
        return
      }
      // RPC returns the updated row (may be an array depending on definition).
      const updated = Array.isArray(data) ? data[0] : data
      if (updated) setClaim(updated)
      await loadHistory()
      onMutate?.()
      setToast({ tone: 'good', msg: 'Changes saved.' })
    } catch (err) {
      setToast({ tone: 'bad', msg: 'Save failed: ' + (err.message || String(err)) })
    } finally {
      setSaving(false)
    }
  }

  // Callback from CollectedControl after the mark_claim_collected RPC. On
  // success it hands back the updated row; on failure, just a toast.
  async function handleCollectedChange(updated, t) {
    if (updated) {
      setClaim(updated)
      await loadHistory()
      onMutate?.()
    }
    if (t) setToast(t)
  }

  const countdown = claim ? filingCountdown(claim.timely_filing_deadline) : null

  return (
    <div className="drawer-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.() }}>
      <div className="drawer" role="dialog" aria-modal="true" aria-label="Claim detail">
        {/* ---------- Header ---------- */}
        <div className="drawer-head">
          {claim ? (
            <div className="col" style={{ gap: 8 }}>
              <div className="row-wrap" style={{ gap: 10, alignItems: 'baseline' }}>
                <span className="mono" style={{ fontSize: 16, fontWeight: 700 }}>
                  {claim.source_claim_id}
                </span>
                <span style={{ color: 'rgba(255,255,255,0.85)' }}>{claim.payer_name}</span>
              </div>
              <div className="row-wrap" style={{ gap: 8 }}>
                <StatusBadge status={claim.status} />
                <ResolutionBadge resolution={claim.resolution} />
                <TierBadge tier={claim.tier} />
                {claim.collected ? (
                  <span
                    className="pill"
                    style={{
                      color: 'var(--good)',
                      borderColor: 'var(--good)',
                      background: 'rgba(255,255,255,0.9)',
                    }}
                    title="Money confirmed in bank"
                  >
                    ✓ Collected {money(claim.collected_amount)}
                  </span>
                ) : null}
                {countdown ? (
                  <span
                    className="pill"
                    style={{
                      color: TONE_COLOR[countdown.tone] || 'var(--muted)',
                      borderColor: TONE_COLOR[countdown.tone] || 'var(--muted)',
                      background: 'rgba(255,255,255,0.9)',
                    }}
                    title="Timely-filing countdown"
                  >
                    {countdown.label}
                  </span>
                ) : null}
              </div>
              <div className="row" style={{ gap: 8, alignItems: 'baseline' }}>
                <span style={{ fontSize: 20, fontWeight: 750 }}>{money(claim.balance)}</span>
                <span style={{ fontSize: 11.5, color: 'rgba(255,255,255,0.7)' }}>
                  at-risk balance under recovery
                </span>
              </div>
            </div>
          ) : (
            <span style={{ fontWeight: 650 }}>Claim</span>
          )}
          <button className="drawer-close" onClick={onClose} aria-label="Close">×</button>
        </div>

        {/* ---------- Body ---------- */}
        <div className="drawer-body">
          {!isSupabaseConfigured ? (
            <Toast tone="warn">Supabase isn’t configured — claim data is unavailable.</Toast>
          ) : loading ? (
            <Spinner label="Loading claim…" />
          ) : notFound || !claim ? (
            <EmptyState title="Claim not found" hint="It may have been removed or you don’t have access." />
          ) : (
            <>
              {toast ? (
                <Toast tone={toast.tone} onClose={() => setToast(null)}>{toast.msg}</Toast>
              ) : null}

              <CollectedControl
                claim={claim}
                editable={editable}
                nameOf={nameOf}
                onCollectedChange={handleCollectedChange}
              />

              <ClaimFields
                claim={claim}
                profiles={profiles}
                editable={editable}
                saving={saving}
                onSave={handleSave}
              />

              <section>
                <div className="drawer-section-title">Status history</div>
                <StatusTimeline history={history} nameOf={nameOf} />
              </section>

              <CommentThread
                claimId={claimId}
                claim={claim}
                canEdit={canEdit}
                user={user}
                profiles={profiles}
                byId={byId}
                nameOf={nameOf}
              />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
