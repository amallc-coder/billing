import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'

// All profiles — used for assignment dropdowns and @mention autocomplete.
export function useProfiles() {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('profiles')
      .select('id, email, full_name, role, allowed_tabs')
      .order('full_name', { ascending: true })
      .then(({ data }) => {
        if (!active) return
        setProfiles(data ?? [])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const byId = Object.fromEntries(profiles.map((p) => [p.id, p]))
  const nameOf = (id) => byId[id]?.full_name ?? byId[id]?.email ?? '—'
  return { profiles, byId, nameOf, loading }
}
