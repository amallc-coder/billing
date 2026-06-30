import { useState, useCallback, lazy, Suspense } from 'react'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { Toast, Spinner } from '../components/ui/Primitives'

// Code-split the heavy tabs (recharts / xlsx) so they load on demand.
const AnalyticsDashboard = lazy(() => import('../components/analytics/AnalyticsDashboard'))
const Worklist = lazy(() => import('../components/worklist/Worklist'))
const UploadWizard = lazy(() => import('../components/upload/UploadWizard'))
const ClaimDrawer = lazy(() => import('../components/claim/ClaimDrawer'))

const TABS = [
  { key: 'dashboard', label: 'Analytics' },
  { key: 'worklist', label: 'Worklist' },
  { key: 'upload', label: 'Upload', editorsOnly: true },
]

export default function ClaimsRecovery() {
  const { canEdit } = useAuth()
  const [tab, setTab] = useState('dashboard')
  const [selectedClaimId, setSelectedClaimId] = useState(null)
  // Bumped to ask sibling tabs to refetch after a mutation or upload.
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  const openClaim = useCallback((id) => setSelectedClaimId(id), [])
  const closeClaim = useCallback(() => setSelectedClaimId(null), [])

  const visibleTabs = TABS.filter((t) => !t.editorsOnly || canEdit)

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1 className="page-title">Claims Recovery</h1>
          <p className="page-sub muted">
            Unpaid claims under recovery — pipeline / at-risk revenue, not booked revenue.
          </p>
        </div>
      </div>

      {!isSupabaseConfigured && (
        <Toast tone="warn">
          Running without a Supabase connection. Configure <code>.env</code> to load and persist claims.
        </Toast>
      )}

      <div className="tabs" role="tablist">
        {visibleTabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            className={`tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="tab-panel">
        <Suspense fallback={<Spinner label="Loading…" />}>
          {tab === 'dashboard' && (
            <AnalyticsDashboard refreshKey={refreshKey} onSelectClaim={openClaim} />
          )}
          {tab === 'worklist' && (
            <Worklist refreshKey={refreshKey} onSelectClaim={openClaim} onMutate={refresh} />
          )}
          {tab === 'upload' && canEdit && (
            <UploadWizard
              onCommitted={() => {
                refresh()
                setTab('worklist')
              }}
            />
          )}
        </Suspense>
      </div>

      {selectedClaimId && (
        <Suspense fallback={null}>
          <ClaimDrawer claimId={selectedClaimId} onClose={closeClaim} onMutate={refresh} />
        </Suspense>
      )}
    </div>
  )
}
