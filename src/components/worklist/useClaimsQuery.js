// ============================================================================
// useClaimsQuery — server-paginated, filtered, multi-key-sorted fetch of the
// `claims` table. Refetches whenever any of its inputs (filters/sort/page/
// refreshKey) change. All filtering & sorting happens server-side.
// ============================================================================
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient'

export const PAGE_SIZE = 50

// Columns we read back for the worklist rows. Kept lean — the drawer fetches
// the full row when a claim is opened.
const COLUMNS = [
  'id',
  'source_claim_id',
  'payer_name',
  'payer_type',
  'subsidiary',
  'service_date',
  'aging_bucket',
  'balance',
  'status',
  'resolution',
  'assigned_to',
  'next_action',
  'tier',
  'priority_score',
  'follow_up_date',
  'denial_code',
  'timely_filing_deadline',
].join(', ')

// Default multi-key sort: Tier A first, then highest balance, then oldest DOS.
// When a user picks an explicit sort we lead with their key, then fall back to
// the default keys for a stable, sensible order.
const DEFAULT_SORT = [
  { col: 'tier', ascending: true },
  { col: 'balance', ascending: false },
  { col: 'service_date', ascending: true },
]

function buildOrder(sort) {
  if (!sort || !sort.col) return DEFAULT_SORT
  const primary = { col: sort.col, ascending: sort.ascending }
  // Append default keys (minus the primary) as tiebreakers.
  const tiebreakers = DEFAULT_SORT.filter((s) => s.col !== sort.col)
  return [primary, ...tiebreakers]
}

// Apply the active filters to a Supabase query builder.
function applyFilters(query, filters) {
  const f = filters || {}
  if (f.status) query = query.eq('status', f.status)
  if (f.resolution) query = query.eq('resolution', f.resolution)
  if (f.tier) query = query.eq('tier', f.tier)
  if (f.aging_bucket) query = query.eq('aging_bucket', f.aging_bucket)
  if (f.assigned_to) query = query.eq('assigned_to', f.assigned_to)
  if (f.payer_name && f.payer_name.trim()) query = query.ilike('payer_name', `%${f.payer_name.trim()}%`)
  if (f.subsidiary && f.subsidiary.trim()) query = query.ilike('subsidiary', `%${f.subsidiary.trim()}%`)
  if (f.denial_code && f.denial_code.trim()) query = query.ilike('denial_code', `%${f.denial_code.trim()}%`)
  if (f.search && f.search.trim()) query = query.ilike('source_claim_id', `%${f.search.trim()}%`)
  return query
}

export function useClaimsQuery({ filters, sort, page, refreshKey }) {
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  // Bumped by refetch() to force a re-run without changing external inputs.
  const [nonce, setNonce] = useState(0)

  // Latest-request guard so a slow earlier fetch can't overwrite a newer one.
  const reqId = useRef(0)

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setRows([])
      setCount(0)
      setLoading(false)
      setError('not_configured')
      return
    }

    const myReq = ++reqId.current
    let active = true
    setLoading(true)
    setError(null)

    const from = page * PAGE_SIZE
    const to = from + PAGE_SIZE - 1

    let query = supabase.from('claims').select(COLUMNS, { count: 'exact' })
    query = applyFilters(query, filters)
    for (const o of buildOrder(sort)) {
      query = query.order(o.col, { ascending: o.ascending, nullsFirst: false })
    }
    query = query.range(from, to)

    query.then(({ data, count: total, error: err }) => {
      if (!active || myReq !== reqId.current) return
      if (err) {
        setError(err.message || 'Failed to load claims.')
        setRows([])
        setCount(0)
      } else {
        setRows(data || [])
        setCount(total || 0)
      }
      setLoading(false)
    })

    return () => {
      active = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, sort, page, refreshKey, nonce])

  const refetch = useCallback(() => setNonce((n) => n + 1), [])

  return { rows, count, loading, error, refetch, pageSize: PAGE_SIZE }
}
