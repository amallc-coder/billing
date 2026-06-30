import { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId) => {
    if (!userId) {
      setProfile(null)
      return
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, email, full_name, role')
      .eq('id', userId)
      .maybeSingle()
    setProfile(data ?? null)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false)
      return
    }
    let active = true

    supabase.auth.getSession().then(({ data }) => {
      if (!active) return
      setSession(data.session ?? null)
      loadProfile(data.session?.user?.id).finally(() => active && setLoading(false))
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession ?? null)
      loadProfile(nextSession?.user?.id)
    })

    return () => {
      active = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
  }, [])

  const value = useMemo(() => {
    const role = profile?.role ?? null
    return {
      session,
      user: session?.user ?? null,
      profile,
      role,
      loading,
      isConfigured: isSupabaseConfigured,
      isAdmin: role === 'admin',
      isBiller: role === 'biller',
      isViewer: role === 'viewer',
      canEdit: role === 'admin' || role === 'biller',
      refreshProfile: () => loadProfile(session?.user?.id),
      signOut,
    }
  }, [session, profile, loading, loadProfile, signOut])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within an AuthProvider')
  return ctx
}
