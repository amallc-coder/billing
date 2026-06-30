// ============================================================================
// WorklistFilters — the server-side filter bar for the worklist.
// Text inputs are debounced upstream (in Worklist) so we keep local controlled
// state here and emit changes immediately; the orchestrator decides timing.
// ============================================================================
import { useEffect, useState } from 'react'
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient'
import {
  STATUSES,
  RESOLUTIONS,
  AGING_BUCKETS,
  TIER_ORDER,
  TIERS,
} from '../../lib/constants'
import { Button } from '../../components/ui/Primitives'

// Fetch a modest sample of distinct subsidiaries for the select. If it fails or
// returns nothing we fall back to a free-text input (handled by the caller-ish
// logic below: empty list => text input).
function useSubsidiaries() {
  const [list, setList] = useState([])
  useEffect(() => {
    if (!isSupabaseConfigured) return
    let active = true
    supabase
      .from('claims')
      .select('subsidiary')
      .not('subsidiary', 'is', null)
      .limit(1000)
      .then(({ data }) => {
        if (!active || !data) return
        const distinct = Array.from(
          new Set(data.map((r) => r.subsidiary).filter(Boolean)),
        ).sort((a, b) => a.localeCompare(b))
        setList(distinct)
      })
    return () => {
      active = false
    }
  }, [])
  return list
}

export default function WorklistFilters({ filters, onChange, onClear, profiles }) {
  const subsidiaries = useSubsidiaries()
  const set = (key) => (e) => onChange(key, e.target.value)

  const hasActive = Object.values(filters).some((v) => v && String(v).length > 0)

  return (
    <div className="filter-row" style={{ marginBottom: 14 }}>
      {/* Free-text search on claim # */}
      <label className="field" style={{ minWidth: 170 }}>
        <span className="field-label">Search claim #</span>
        <input
          type="text"
          placeholder="Source claim ID…"
          value={filters.search}
          onChange={set('search')}
        />
      </label>

      <label className="field" style={{ minWidth: 150 }}>
        <span className="field-label">Status</span>
        <select value={filters.status} onChange={set('status')}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field" style={{ minWidth: 170 }}>
        <span className="field-label">Resolution</span>
        <select value={filters.resolution} onChange={set('resolution')}>
          <option value="">All resolutions</option>
          {RESOLUTIONS.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>
      </label>

      <label className="field" style={{ minWidth: 150 }}>
        <span className="field-label">Payer name</span>
        <input
          type="text"
          placeholder="Contains…"
          value={filters.payer_name}
          onChange={set('payer_name')}
        />
      </label>

      <label className="field" style={{ minWidth: 150 }}>
        <span className="field-label">Subsidiary</span>
        {subsidiaries.length > 0 ? (
          <select value={filters.subsidiary} onChange={set('subsidiary')}>
            <option value="">All subsidiaries</option>
            {subsidiaries.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            placeholder="Contains…"
            value={filters.subsidiary}
            onChange={set('subsidiary')}
          />
        )}
      </label>

      <label className="field" style={{ minWidth: 160 }}>
        <span className="field-label">Assigned to</span>
        <select value={filters.assigned_to} onChange={set('assigned_to')}>
          <option value="">Anyone</option>
          {profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.full_name || p.email}
            </option>
          ))}
        </select>
      </label>

      <label className="field" style={{ minWidth: 120 }}>
        <span className="field-label">Aging</span>
        <select value={filters.aging_bucket} onChange={set('aging_bucket')}>
          <option value="">All ages</option>
          {AGING_BUCKETS.map((b) => (
            <option key={b} value={b}>
              {b} days
            </option>
          ))}
        </select>
      </label>

      <label className="field" style={{ minWidth: 120 }}>
        <span className="field-label">Tier</span>
        <select value={filters.tier} onChange={set('tier')}>
          <option value="">All tiers</option>
          {TIER_ORDER.map((t) => (
            <option key={t} value={t}>
              {TIERS[t]?.label || t}
            </option>
          ))}
        </select>
      </label>

      <label className="field" style={{ minWidth: 130 }}>
        <span className="field-label">Denial code</span>
        <input
          type="text"
          placeholder="Contains…"
          value={filters.denial_code}
          onChange={set('denial_code')}
        />
      </label>

      <div className="field" style={{ justifyContent: 'flex-end' }}>
        <span className="field-label">&nbsp;</span>
        <Button variant="secondary" size="sm" onClick={onClear} disabled={!hasActive}>
          Clear filters
        </Button>
      </div>
    </div>
  )
}
