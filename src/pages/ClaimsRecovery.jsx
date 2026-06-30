import { useState, useCallback, useMemo, lazy, Suspense } from 'react'
import { useAuth } from '../context/AuthContext'
import { isSupabaseConfigured } from '../lib/supabaseClient'
import { Toast, Spinner } from '../components/ui/Primitives'
import { visibleTabs, visibleSubTabs } from '../lib/tabs'

// Code-split the heavy tabs (recharts / xlsx) so they load on demand.
const AnalyticsDashboard = lazy(() => import('../components/analytics/AnalyticsDashboard'))
const Worklist = lazy(() => import('../components/worklist/Worklist'))
const UploadWizard = lazy(() => import('../components/upload/UploadWizard'))
const ClaimDrawer = lazy(() => import('../components/claim/ClaimDrawer'))
const SettingsPanel = lazy(() => import('../components/settings/SettingsPanel'))

export default function ClaimsRecovery() {
  const { profile, canEdit } = useAuth()

  const tabs = useMemo(() => visibleTabs(profile, { canEdit }), [profile, canEdit])

  const [tab, setTab] = useState(() => tabs[0]?.key ?? 'dashboard')
  const [subTab, setSubTab] = useState(() => visibleSubTabs(profile, tabs[0]?.key)[0]?.key ?? null)
  const [selectedClaimId, setSelectedClaimId] = useState(null)
  // Bumped to ask sibling tabs to refetch after a mutation or upload.
  const [refreshKey, setRefreshKey] = useState(0)

  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])
  const openClaim = useCallback((id) => setSelectedClaimId(id), [])
  const closeClaim = useCallback(() => setSelectedClaimId(null), [])

  // Keep the active tab valid as access/visibility changes.
  const activeTab = tabs.some((t) => t.key === tab) ? tab : tabs[0]?.key ?? 'dashboard'
  const subTabs = visibleSubTabs(profile, activeTab)

  const selectTab = useCallback(
    (key) => {
      setTab(key)
      setSubTab(visibleSubTabs(profile, key)[0]?.key ?? null)
    },
    [profile],
  )

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
        {tabs.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={activeTab === t.key}
            className={`tab ${activeTab === t.key ? 'active' : ''}`}
            onClick={() => selectTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTabs.length > 0 && (
        <div className="tabs" role="tablist" style={{ marginTop: -8 }}>
          {subTabs.map((s) => (
            <button
              key={s.key}
              role="tab"
              aria-selected={subTab === s.key}
              className={`tab ${subTab === s.key ? 'active' : ''}`}
              style={{ fontSize: 12, padding: '5px 12px' }}
              onClick={() => setSubTab(s.key)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      <div className="tab-panel">
        <Suspense fallback={<Spinner label="Loading…" />}>
          {activeTab === 'dashboard' && (
            <AnalyticsDashboard refreshKey={refreshKey} subTab={subTab} onSelectClaim={openClaim} />
          )}
          {activeTab === 'worklist' && (
            <Worklist refreshKey={refreshKey} onSelectClaim={openClaim} onMutate={refresh} />
          )}
          {activeTab === 'upload' && canEdit && (
            <UploadWizard
              onCommitted={() => {
                refresh()
                selectTab('worklist')
              }}
            />
          )}
          {activeTab === 'settings' && <SettingsPanel subTab={subTab} onMutate={refresh} />}
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
