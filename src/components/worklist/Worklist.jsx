// ============================================================================
// Worklist — the orchestrator for the filterable, sortable, server-paginated
// claims worklist with bulk actions. Default export per the module contract.
//
// Props:
//   refreshKey      number   — refetch whenever it changes
//   onSelectClaim   (id)     — open the claim drawer
//   onMutate        ()       — call after we change data (siblings refresh)
//
// Framing: balances shown here are OPEN AR / at-risk pipeline, not booked
// revenue.
// ============================================================================
import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient'
import { useAuth } from '../../context/AuthContext'
import { useProfiles } from '../../hooks/useProfiles'
import { number } from '../../lib/format'
import { Button, Card, Spinner, EmptyState, Toast } from '../../components/ui/Primitives'
import { useClaimsQuery } from './useClaimsQuery'
import WorklistFilters from './WorklistFilters'
import WorklistTable from './WorklistTable'
import BulkActionBar from './BulkActionBar'

const EMPTY_FILTERS = {
  search: '',
  status: '',
  resolution: '',
  payer_name: '',
  subsidiary: '',
  assigned_to: '',
  aging_bucket: '',
  tier: '',
  denial_code: '',
}

// Filter keys whose values come from text inputs and should be debounced
// before they hit the query (so we don't fetch on every keystroke).
const TEXT_KEYS = ['search', 'payer_name', 'subsidiary', 'denial_code']
const DEBOUNCE_MS = 300

export default function Worklist({ refreshKey, onSelectClaim, onMutate }) {
  const { isAdmin } = useAuth()
  const { profiles, nameOf } = useProfiles()

  // Raw filters reflect the inputs immediately; debounced filters drive the
  // query. Select-type filters apply instantly; text filters are debounced.
  const [rawFilters, setRawFilters] = useState(EMPTY_FILTERS)
  const [debouncedFilters, setDebouncedFilters] = useState(EMPTY_FILTERS)

  // null sort => use the default multi-key sort in the query hook.
  const [sort, setSort] = useState({ col: null, ascending: true })
  const [page, setPage] = useState(0)

  const [selected, setSelected] = useState(() => new Set())
  const [bulkBusy, setBulkBusy] = useState(false)
  const [toast, setToast] = useState(null) // { tone, msg }

  // --- Debounce text filters -------------------------------------------------
  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedFilters((prev) => {
        const next = { ...prev }
        for (const k of TEXT_KEYS) next[k] = rawFilters[k]
        return next
      })
    }, DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [rawFilters])

  // The query consumes debouncedFilters. We memoize so the hook's effect only
  // re-runs when the values actually change.
  const queryFilters = debouncedFilters
  const filtersKey = JSON.stringify(queryFilters)
  const stableFilters = useMemo(() => queryFilters, [filtersKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const { rows, count, loading, error, refetch, pageSize } = useClaimsQuery({
    filters: stableFilters,
    sort,
    page,
    refreshKey,
  })

  // Reset to page 0 whenever filters or sort change (avoid landing past the end).
  const prevDeps = useRef({ filtersKey, sort })
  useEffect(() => {
    if (prevDeps.current.filtersKey !== filtersKey || prevDeps.current.sort !== sort) {
      setPage(0)
      prevDeps.current = { filtersKey, sort }
    }
  }, [filtersKey, sort])

  // Clear selection when the underlying result set changes (new page/filter/
  // sort/refresh) so we never act on stale, off-screen ids.
  useEffect(() => {
    setSelected(new Set())
  }, [filtersKey, sort, page, refreshKey])

  // --- Filter handlers -------------------------------------------------------
  const handleFilterChange = useCallback((key, value) => {
    setRawFilters((f) => ({ ...f, [key]: value }))
    // Non-text filters apply immediately (debounce effect handles text keys).
    if (!TEXT_KEYS.includes(key)) {
      setDebouncedFilters((f) => ({ ...f, [key]: value }))
    }
  }, [])

  const handleClearFilters = useCallback(() => {
    setRawFilters(EMPTY_FILTERS)
    setDebouncedFilters(EMPTY_FILTERS)
    setPage(0)
  }, [])

  // --- Sort handler — toggle asc/desc on repeat clicks ----------------------
  const handleSort = useCallback((col) => {
    setSort((s) => (s.col === col ? { col, ascending: !s.ascending } : { col, ascending: true }))
  }, [])

  // --- Selection handlers ----------------------------------------------------
  const toggleRow = useCallback((id) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }, [])

  const toggleAll = useCallback(
    (checked) => {
      setSelected(checked ? new Set(rows.map((r) => r.id)) : new Set())
    },
    [rows],
  )

  const clearSelection = useCallback(() => setSelected(new Set()), [])

  // --- Bulk apply via update_claim RPC (per claim) --------------------------
  // patch keys: status / resolution / assigned_to / follow_up_date / next_action.
  const runBulk = useCallback(
    async (patch, note) => {
      const ids = Array.from(selected)
      if (ids.length === 0) return
      setBulkBusy(true)
      let ok = 0
      const failures = []
      for (const id of ids) {
        const { error: err } = await supabase.rpc('update_claim', {
          p_claim_id: id,
          p_patch: patch,
          p_note: note || '',
        })
        if (err) failures.push(id)
        else ok += 1
      }
      setBulkBusy(false)

      if (failures.length === 0) {
        setToast({ tone: 'good', msg: `Updated ${ok} claim${ok === 1 ? '' : 's'}.` })
      } else if (ok === 0) {
        setToast({
          tone: 'bad',
          msg: `Could not update ${failures.length} claim${failures.length === 1 ? '' : 's'} (permission denied).`,
        })
      } else {
        setToast({
          tone: 'warn',
          msg: `Updated ${ok}; ${failures.length} failed (you can only edit claims assigned to you).`,
        })
      }

      // Clear selection, refetch this list, and notify siblings.
      clearSelection()
      refetch()
      onMutate?.()
    },
    [selected, clearSelection, refetch, onMutate],
  )

  const handleAssign = useCallback((userId) => runBulk({ assigned_to: userId }), [runBulk])
  const handleChangeStatus = useCallback(
    (status, note) => runBulk({ status }, note),
    [runBulk],
  )
  const handleSetFollowUp = useCallback(
    (date) => runBulk({ follow_up_date: date }),
    [runBulk],
  )

  // --- Pagination ------------------------------------------------------------
  const totalPages = Math.max(1, Math.ceil(count / pageSize))
  const canPrev = page > 0
  const canNext = page < totalPages - 1

  // --- Not configured --------------------------------------------------------
  if (!isSupabaseConfigured) {
    return (
      <Toast tone="warn">
        Worklist is unavailable without a Supabase connection. Configure <code>.env</code> with
        your project URL and anon key to load claims.
      </Toast>
    )
  }

  return (
    <div className="section">
      <Card className="panel">
        <div className="panel-head">
          <span className="panel-title">Claims Worklist</span>
          <span className="muted" style={{ fontSize: 12 }}>
            {number(count)} open claim{count === 1 ? '' : 's'} · at-risk AR pipeline
          </span>
        </div>

        <WorklistFilters
          filters={rawFilters}
          onChange={handleFilterChange}
          onClear={handleClearFilters}
          profiles={profiles}
        />

        {selected.size > 0 && (
          <BulkActionBar
            count={selected.size}
            isAdmin={isAdmin}
            profiles={profiles}
            busy={bulkBusy}
            onAssign={handleAssign}
            onChangeStatus={handleChangeStatus}
            onSetFollowUp={handleSetFollowUp}
            onClear={clearSelection}
          />
        )}

        {toast && (
          <div style={{ marginBottom: 14 }}>
            <Toast tone={toast.tone} onClose={() => setToast(null)}>
              {toast.msg}
            </Toast>
          </div>
        )}

        {error && error !== 'not_configured' && (
          <div style={{ marginBottom: 14 }}>
            <Toast tone="bad">Failed to load claims: {error}</Toast>
          </div>
        )}

        {loading ? (
          <Spinner label="Loading claims…" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No claims match these filters."
            hint="Try clearing filters or widening your search."
            action={
              <Button variant="secondary" size="sm" onClick={handleClearFilters}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <>
            <WorklistTable
              rows={rows}
              sort={sort}
              onSort={handleSort}
              selected={selected}
              onToggleRow={toggleRow}
              onToggleAll={toggleAll}
              onSelectClaim={onSelectClaim}
              nameOf={nameOf}
            />

            {/* Pagination controls */}
            <div className="spread" style={{ marginTop: 12 }}>
              <span className="muted" style={{ fontSize: 12 }}>
                Page {page + 1} of {totalPages} · {number(count)} total
              </span>
              <div className="row gap-sm" style={{ gap: 8 }}>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canPrev}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                >
                  ← Prev
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  disabled={!canNext}
                  onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
                >
                  Next →
                </Button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  )
}
