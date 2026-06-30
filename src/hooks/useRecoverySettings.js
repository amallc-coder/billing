import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { curveFromSettings } from '../lib/domain'
import { DEFAULT_COLLECTION_CURVE } from '../lib/constants'

// Loads the configurable collection-probability curve (recovery_settings).
// Falls back to DEFAULT_COLLECTION_CURVE if the table is empty/unreachable.
export function useRecoverySettings() {
  const [curve, setCurve] = useState(DEFAULT_COLLECTION_CURVE)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('recovery_settings')
      .select('aging_bucket, collection_probability, sort_order')
      .order('sort_order', { ascending: true })
      .then(({ data }) => {
        if (!active) return
        if (data?.length) {
          setRows(data)
          setCurve(curveFromSettings(data))
        }
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return { curve, rows, loading }
}
